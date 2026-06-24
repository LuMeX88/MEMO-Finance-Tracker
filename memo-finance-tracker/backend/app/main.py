import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
# Configured here in Python (not via `uvicorn --log-config <file>`) so a missing
# or invalid file can never stop the add-on from starting. Run before importing
# the app modules below so their import-time log lines are timestamped too.
# uvicorn sets up its own logging *before* importing this module, so this call
# overrides uvicorn's loggers with the same timestamped format.
_LOG_FORMATTER = {
    "format": "[%(asctime)s] %(levelname)s: %(message)s",
    "datefmt": "%Y-%m-%d %H:%M:%S",
}
logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"timestamped": _LOG_FORMATTER},
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "timestamped",
                "stream": "ext://sys.stderr",
            }
        },
        "loggers": {
            # uvicorn's loggers (incl. access log) pass their fields through the
            # message, so a plain timestamped formatter renders them correctly.
            "uvicorn": {"level": "INFO", "handlers": ["console"], "propagate": False},
            "uvicorn.error": {"level": "INFO", "handlers": ["console"], "propagate": False},
            "uvicorn.access": {"level": "INFO", "handlers": ["console"], "propagate": False},
            # Application loggers: memo, memo.ai, memo.ocr, ...
            "memo": {"level": "INFO", "handlers": ["console"], "propagate": False},
        },
        "root": {"level": "INFO", "handlers": ["console"]},
    }
)

from sqlalchemy import inspect as sa_inspect, text

from app.database import Base, SessionLocal, engine
from app.services.mqtt_publisher import MqttPublisher
from app.services.ai import ai_service
from app.version import get_version

# Import all models so SQLAlchemy registers them before create_all
from app.models import Category, IntervalType, Project, ProjectColumn, ProjectTask, Schedule, ScheduleSuggestion, SuggestionStatus, Transaction, TransactionType  # noqa: F401

from app.routers import categories, forecast, projects, receipts, reports, schedules, suggestions, transactions
from app.routers import ai
from app.routers import demo
from app.routers import settings as settings_router
from app.routers.projects import reconcile_all_projects

# ---------------------------------------------------------------------------
# Default categories seeded on first startup
# ---------------------------------------------------------------------------
_DEFAULT_CATEGORIES = [
    {"name": "Food & Drinks", "icon": "🍔", "color": "#FF6B6B"},
    {"name": "Transport",     "icon": "🚌", "color": "#4ECDC4"},
    {"name": "Housing",       "icon": "🏠", "color": "#45B7D1"},
    {"name": "Health",        "icon": "💊", "color": "#96CEB4"},
    {"name": "Entertainment", "icon": "🎬", "color": "#FFEAA7"},
    {"name": "Shopping",      "icon": "🛍️", "color": "#DDA0DD"},
    {"name": "Travel",        "icon": "✈️", "color": "#98D8C8"},
    {"name": "Other",         "icon": "📦", "color": "#B0B0B0"},
]

logger = logging.getLogger("memo")


def _run_light_migrations() -> None:
    """Add columns introduced after a table was first created.

    SQLAlchemy's ``create_all`` only creates missing *tables*; it never alters
    existing ones. New columns on a pre-existing table (here: ``projects.mode``
    and ``projects.icon``) must therefore be added by hand. Safe to run on every
    startup — each ``ALTER`` only fires when the column is actually missing.
    """
    inspector = sa_inspect(engine)
    if "projects" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("projects")}
    statements = []
    if "mode" not in existing:
        statements.append(
            "ALTER TABLE projects ADD COLUMN mode VARCHAR DEFAULT 'kanban' NOT NULL"
        )
    if "icon" not in existing:
        statements.append("ALTER TABLE projects ADD COLUMN icon VARCHAR")
    # project_tasks gained a link to the auto-managed booked-cost transaction.
    if "project_tasks" in inspector.get_table_names():
        task_cols = {col["name"] for col in inspector.get_columns("project_tasks")}
        if "transaction_id" not in task_cols:
            statements.append(
                "ALTER TABLE project_tasks ADD COLUMN transaction_id INTEGER"
            )
        if "category_id" not in task_cols:
            statements.append(
                "ALTER TABLE project_tasks ADD COLUMN category_id INTEGER"
            )
    if not statements:
        return
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    logger.info("Applied project schema migrations: %s", "; ".join(statements))


async def _mqtt_publish_loop(publisher: MqttPublisher) -> None:
    """Periodically push current metrics to the MQTT broker."""
    while True:
        await asyncio.sleep(publisher.publish_interval)
        try:
            await asyncio.to_thread(publisher.publish_state)
        except Exception:  # pragma: no cover - keep the loop alive
            logger.exception("Periodic MQTT publish failed")


# ---------------------------------------------------------------------------
# Lifespan: DB init + seed + optional MQTT discovery
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Add any columns introduced after the tables were first created.
    _run_light_migrations()

    # Seed default categories if the table is empty
    db = SessionLocal()
    try:
        if db.query(Category).count() == 0:
            for data in _DEFAULT_CATEGORIES:
                db.add(Category(**data))
            db.commit()
        # Mirror booked task costs into transactions. Doing this at startup
        # catches Waterfall tasks whose end date has passed while the add-on
        # was stopped, so their costs show up in bookings/reports/budget bars.
        try:
            reconcile_all_projects(db)
        except Exception:  # pragma: no cover - never block startup on this
            logger.exception("Project booked-cost reconciliation failed at startup")
    finally:
        db.close()
    # Optional MQTT Discovery publisher (no-op unless MQTT_HOST is configured)
    publisher = MqttPublisher()
    mqtt_task = None
    if publisher.enabled and publisher.connect():
        mqtt_task = asyncio.create_task(_mqtt_publish_loop(publisher))
    app.state.mqtt_publisher = publisher

    # Kick off the local AI model download + load in the background so it never
    # blocks startup or the health check (no-op when AI is disabled).
    ai_service.start_background_init()

    yield

    if mqtt_task:
        mqtt_task.cancel()
        try:
            await mqtt_task
        except asyncio.CancelledError:
            pass
    publisher.disconnect()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="MEMO – Finance Tracker API",
    description="Personal Expenses Management – REST API",
    version=get_version()["version"],
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
API_PREFIX = "/api/v1"

app.include_router(transactions.router, prefix=API_PREFIX)
app.include_router(categories.router, prefix=API_PREFIX)
app.include_router(projects.router, prefix=API_PREFIX)
app.include_router(schedules.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(receipts.router, prefix=API_PREFIX)
app.include_router(suggestions.router, prefix=API_PREFIX)
app.include_router(forecast.router, prefix=API_PREFIX)
app.include_router(ai.router, prefix=API_PREFIX)
app.include_router(demo.router, prefix=API_PREFIX)
app.include_router(settings_router.router, prefix=API_PREFIX)


# ---------------------------------------------------------------------------
# Health check (used by the add-on / container healthcheck)
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", **get_version()}


# ---------------------------------------------------------------------------
# Version info (consumed by the Settings page — fully offline)
# ---------------------------------------------------------------------------
@app.get(f"{API_PREFIX}/version", tags=["version"])
def version():
    return get_version()


# ---------------------------------------------------------------------------
# Serve the built frontend (single-container / Home Assistant add-on).
# In local dev there is no build, so this is skipped and the SPA runs on Vite.
#
# NOTE: we deliberately do NOT mount StaticFiles at "/". A catch-all mount at
# the site root shadows FastAPI's trailing-slash redirects, so a request to a
# collection endpoint without the slash (e.g. "/api/v1/categories", which the
# frontend uses) would be swallowed by StaticFiles and return 404 instead of
# redirecting to "/api/v1/categories/". Mounting only "/assets" plus
# single-segment root-file routes keeps every "/api/v1/..." path intact.
# ---------------------------------------------------------------------------
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():
    _INDEX_FILE = _STATIC_DIR / "index.html"
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(_INDEX_FILE)

    @app.get("/{filename}", include_in_schema=False)
    def serve_spa(filename: str):
        # Single-segment paths only, so multi-segment "/api/v1/..." routes keep
        # working (including the trailing-slash redirects). Serve a real
        # root-level file when present, otherwise fall back to the SPA shell.
        candidate = (_STATIC_DIR / filename).resolve()
        if candidate.is_file() and _STATIC_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_INDEX_FILE)
else:
    @app.get("/", tags=["health"])
    def root():
        return {"message": "MEMO Finance Tracker API (dev mode)", **get_version()}
