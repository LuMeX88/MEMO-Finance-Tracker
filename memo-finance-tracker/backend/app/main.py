import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, SessionLocal, engine
from app.services.mqtt_publisher import MqttPublisher

# Import all models so SQLAlchemy registers them before create_all
from app.models import Category, IntervalType, Project, Schedule, ScheduleSuggestion, SuggestionStatus, Transaction, TransactionType  # noqa: F401

from app.routers import categories, forecast, projects, receipts, reports, schedules, suggestions, transactions

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

    # Seed default categories if the table is empty
    db = SessionLocal()
    try:
        if db.query(Category).count() == 0:
            for data in _DEFAULT_CATEGORIES:
                db.add(Category(**data))
            db.commit()
    finally:
        db.close()

    # Optional MQTT Discovery publisher (no-op unless MQTT_HOST is configured)
    publisher = MqttPublisher()
    mqtt_task = None
    if publisher.enabled and publisher.connect():
        mqtt_task = asyncio.create_task(_mqtt_publish_loop(publisher))
    app.state.mqtt_publisher = publisher

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
    title="HA-Budgeting API",
    description="Personal Expenses Management – REST API",
    version="1.0.0",
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


# ---------------------------------------------------------------------------
# Health check (used by the add-on / container healthcheck)
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "version": "1.0.0"}


# ---------------------------------------------------------------------------
# Serve the built frontend (single-container / Home Assistant add-on).
# Mounted last so it only catches paths not handled by the API or /docs.
# In local dev there is no build, so this is skipped and the SPA runs on Vite.
# ---------------------------------------------------------------------------
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="frontend")
else:
    @app.get("/", tags=["health"])
    def root():
        return {"message": "MEMO Finance Tracker API (dev mode)", "version": "1.0.0"}
