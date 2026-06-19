from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine

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


# ---------------------------------------------------------------------------
# Lifespan: DB init + seed
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

    yield


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
# Health check
# ---------------------------------------------------------------------------
@app.get("/", tags=["health"])
def root():
    return {"message": "HA-Budgeting API is running", "version": "1.0.0"}
