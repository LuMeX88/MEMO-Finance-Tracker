"""Demo data — one-click sample dataset that can be loaded and removed again.

Every record created here is tagged with a ``[Demo]`` marker (in the transaction
note / project name / schedule name) so the *erase* endpoint can remove exactly
the demo entries and nothing the user created themselves.
"""
import calendar
import random
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.project import Project
from app.models.schedule import IntervalType, Schedule
from app.models.transaction import Transaction, TransactionType

router = APIRouter(prefix="/demo", tags=["demo"])

# Records whose text starts with this marker are considered demo data.
DEMO_TAG = "[Demo]"
_DEMO_LIKE = f"{DEMO_TAG}%"

# Seeded only when the user has deleted every category, so the demo always has
# somewhere to attach to. Mirrors the startup defaults (English names).
_FALLBACK_CATEGORIES = [
    {"name": "Food & Drinks", "icon": "🍔", "color": "#FF6B6B"},
    {"name": "Transport", "icon": "🚌", "color": "#4ECDC4"},
    {"name": "Housing", "icon": "🏠", "color": "#45B7D1"},
    {"name": "Health", "icon": "💊", "color": "#96CEB4"},
    {"name": "Entertainment", "icon": "🎬", "color": "#FFEAA7"},
    {"name": "Shopping", "icon": "🛍️", "color": "#DDA0DD"},
    {"name": "Travel", "icon": "✈️", "color": "#98D8C8"},
    {"name": "Other", "icon": "📦", "color": "#B0B0B0"},
]


def _first_of_month(today: date, months_back: int) -> date:
    month_index = today.month - 1 - months_back
    year = today.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _clamp_day(year: int, month: int, day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def _erase_demo(db: Session) -> dict:
    """Delete all demo-tagged records. Transactions first (they reference
    projects), then schedules and projects."""
    transactions = (
        db.query(Transaction).filter(Transaction.note.like(_DEMO_LIKE)).delete(synchronize_session=False)
    )
    schedules = (
        db.query(Schedule).filter(Schedule.name.like(_DEMO_LIKE)).delete(synchronize_session=False)
    )
    projects = (
        db.query(Project).filter(Project.name.like(_DEMO_LIKE)).delete(synchronize_session=False)
    )
    db.commit()
    return {"transactions": transactions, "schedules": schedules, "projects": projects}


@router.post("/load")
def load_demo(db: Session = Depends(get_db)):
    """Populate the app with a realistic ~3-month sample dataset.

    Loading is idempotent: any previously loaded demo data is cleared first, so
    repeated clicks never create duplicates.
    """
    _erase_demo(db)

    categories = db.query(Category).all()
    if not categories:
        for data in _FALLBACK_CATEGORIES:
            db.add(Category(**data))
        db.commit()
        categories = db.query(Category).all()

    by_name = {c.name.strip().lower(): c.id for c in categories}
    fallback_id = by_name.get("other", categories[0].id)

    def cat(name: str) -> int:
        return by_name.get(name.strip().lower(), fallback_id)

    today = date.today()
    rng = random.Random(20240601)  # deterministic but varied

    # ── Demo projects ────────────────────────────────────────────────────────
    kitchen = Project(
        name=f"{DEMO_TAG} Kitchen Renovation",
        budget=6000.0,
        end_date=_clamp_day(today.year, today.month, 28),
        archived=False,
    )
    vacation = Project(name=f"{DEMO_TAG} Summer Vacation", budget=3500.0, end_date=None, archived=False)
    db.add_all([kitchen, vacation])
    db.flush()  # assign ids for the transactions below

    transactions: list[Transaction] = []

    def add(day: date | None, recipient: str, category: str, amount: float,
            ttype: TransactionType, note: str, pm: str = "card", project_id=None) -> None:
        if day is None:
            return
        transactions.append(
            Transaction(
                date=day,
                recipient=recipient,
                category_id=cat(category),
                amount=round(amount, 2),
                type=ttype,
                project_id=project_id,
                payment_method=pm,
                note=f"{DEMO_TAG} {note}".strip(),
            )
        )

    def md(year: int, month: int, day: int, is_current: bool) -> date | None:
        # Never place demo data in the future (skip current-month days > today).
        if is_current and day > today.day:
            return None
        return _clamp_day(year, month, day)

    for m in range(3):
        fom = _first_of_month(today, m)
        y, mo = fom.year, fom.month
        cur = m == 0

        add(md(y, mo, 25, cur), "Acme Corp", "Other", 4800.0, TransactionType.income, "Monthly salary", "transfer")
        add(md(y, mo, 1, cur), "Property Management", "Housing", 1450.0, TransactionType.expense, "Rent", "transfer")
        add(md(y, mo, 4, cur), "HealthPlus Insurance", "Health", 285.0, TransactionType.expense, "Health insurance", "transfer")
        add(md(y, mo, 8, cur), "PowerGrid Utilities", "Housing", 78.0 + rng.uniform(-8, 14), TransactionType.expense, "Electricity")
        add(md(y, mo, 3, cur), "Netflix", "Entertainment", 19.90, TransactionType.expense, "Streaming")
        add(md(y, mo, 3, cur), "Spotify", "Entertainment", 12.95, TransactionType.expense, "Music")
        add(md(y, mo, 6, cur), "FitZone Gym", "Health", 49.0, TransactionType.expense, "Gym membership")

        for w in range(4):  # weekly groceries
            store = rng.choice(["Migros", "Coop", "Aldi", "Lidl", "Denner"])
            add(md(y, mo, 2 + w * 7, cur), store, "Food & Drinks", rng.uniform(38, 125), TransactionType.expense, "Groceries")

        for _ in range(rng.randint(3, 5)):  # dining out
            place = rng.choice(["Bella Italia", "Sushi Bar", "Corner Café", "Burger House", "Thai Garden"])
            add(md(y, mo, rng.randint(1, 28), cur), place, "Food & Drinks", rng.uniform(9, 68),
                TransactionType.expense, "Dining out", rng.choice(["card", "cash", "twint"]))

        for _ in range(rng.randint(2, 3)):  # transport / fuel
            add(md(y, mo, rng.randint(1, 28), cur), rng.choice(["Shell", "BP", "Public Transit", "Uber"]),
                "Transport", rng.uniform(18, 95), TransactionType.expense, "Transport")

        if rng.random() < 0.8:  # occasional shopping
            add(md(y, mo, rng.randint(1, 28), cur), rng.choice(["Zara", "H&M", "MediaMarkt"]),
                "Shopping", rng.uniform(25, 180), TransactionType.expense, "Shopping")

        if rng.random() < 0.5:  # occasional pharmacy
            add(md(y, mo, rng.randint(1, 28), cur), "City Pharmacy", "Health", rng.uniform(12, 60),
                TransactionType.expense, "Pharmacy")

    # ── Project-linked one-offs (recent weeks) ───────────────────────────────
    last = _first_of_month(today, 1)
    add(md(today.year, today.month, 12, True), "IKEA", "Shopping", 1240.0, TransactionType.expense,
        "Kitchen cabinets", "card", kitchen.id)
    add(_clamp_day(last.year, last.month, 18), "Local Handyman", "Housing", 680.0, TransactionType.expense,
        "Kitchen installation", "transfer", kitchen.id)
    add(_clamp_day(last.year, last.month, 22), "SwissAir", "Travel", 540.0, TransactionType.expense,
        "Flights", "card", vacation.id)
    add(_clamp_day(last.year, last.month, 24), "Booking.com", "Travel", 820.0, TransactionType.expense,
        "Hotel", "card", vacation.id)

    db.add_all(transactions)

    # ── Demo schedules (recurring costs) ─────────────────────────────────────
    nxt = _first_of_month(today, -1)
    schedules = [
        Schedule(name=f"{DEMO_TAG} Rent", amount=1450.0, is_variable=False, estimated_amount=None,
                 interval=IntervalType.monthly, next_due_date=_clamp_day(nxt.year, nxt.month, 1),
                 category_id=cat("Housing"), active=True),
        Schedule(name=f"{DEMO_TAG} Streaming", amount=32.85, is_variable=False, estimated_amount=None,
                 interval=IntervalType.monthly, next_due_date=_clamp_day(nxt.year, nxt.month, 3),
                 category_id=cat("Entertainment"), active=True),
        Schedule(name=f"{DEMO_TAG} Car Insurance", amount=780.0, is_variable=False, estimated_amount=None,
                 interval=IntervalType.yearly, next_due_date=_clamp_day(nxt.year, nxt.month, 15),
                 category_id=cat("Transport"), active=True),
    ]
    db.add_all(schedules)

    db.commit()
    return {"transactions": len(transactions), "projects": 2, "schedules": len(schedules)}


@router.post("/erase")
def erase_demo(db: Session = Depends(get_db)):
    """Remove every demo-tagged record (leaves the user's own data untouched)."""
    return _erase_demo(db)
