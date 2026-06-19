"""Detect recurring transaction patterns and create schedule suggestions."""
from datetime import date, datetime, timedelta, timezone
from collections import defaultdict
from typing import Optional

try:
    from rapidfuzz import fuzz
    FUZZY_AVAILABLE = True
except ImportError:
    FUZZY_AVAILABLE = False

from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.models.schedule import Schedule
from app.models.schedule_suggestion import ScheduleSuggestion, SuggestionStatus


FUZZY_THRESHOLD = 80   # % similarity for recipient matching
AMOUNT_TOLERANCE = 0.15  # 15% amount tolerance
MIN_MATCHES = 2
LOOKBACK_DAYS = 180


def _similar(a: str, b: str) -> bool:
    if not FUZZY_AVAILABLE:
        return a.lower().strip() == b.lower().strip()
    return fuzz.ratio(a.lower(), b.lower()) >= FUZZY_THRESHOLD


def _detect_interval(dates: list[date]) -> Optional[str]:
    """Detect weekly, monthly or yearly interval from a list of dates."""
    if len(dates) < 2:
        return None
    dates_sorted = sorted(dates)
    gaps = [(dates_sorted[i+1] - dates_sorted[i]).days for i in range(len(dates_sorted)-1)]
    avg_gap = sum(gaps) / len(gaps)
    if 25 <= avg_gap <= 35:
        return "monthly"
    if 5 <= avg_gap <= 9:
        return "weekly"
    if 350 <= avg_gap <= 380:
        return "yearly"
    return None


def run_pattern_detection(db: Session) -> int:
    """
    Analyze recent transactions, detect recurring patterns,
    create ScheduleSuggestion rows for new patterns.
    Returns number of new suggestions created.
    """
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    transactions = (
        db.query(Transaction)
        .filter(Transaction.date >= cutoff, Transaction.type == "expense")
        .order_by(Transaction.date)
        .all()
    )

    # Group by similar recipient
    groups: dict[str, list[Transaction]] = defaultdict(list)
    seen_recipients: list[str] = []

    for txn in transactions:
        matched = False
        for rep in seen_recipients:
            if _similar(txn.recipient, rep):
                groups[rep].append(txn)
                matched = True
                break
        if not matched:
            seen_recipients.append(txn.recipient)
            groups[txn.recipient].append(txn)

    created = 0
    for representative, txns in groups.items():
        if len(txns) < MIN_MATCHES:
            continue

        # Check amount similarity (within tolerance)
        amounts = [t.amount for t in txns]
        avg_amount = sum(amounts) / len(amounts)
        if any(abs(a - avg_amount) / avg_amount > AMOUNT_TOLERANCE for a in amounts):
            continue

        interval = _detect_interval([t.date for t in txns])
        if not interval:
            continue

        # Skip if already an active schedule for this recipient
        existing_schedule = db.query(Schedule).filter(
            Schedule.name.ilike(f"%{representative[:20]}%"),
            Schedule.active == True
        ).first()
        if existing_schedule:
            continue

        # Skip if already a pending/snoozed suggestion
        existing_suggestion = db.query(ScheduleSuggestion).filter(
            ScheduleSuggestion.recipient == representative,
            ScheduleSuggestion.status.in_([SuggestionStatus.pending, SuggestionStatus.snoozed]),
        ).first()
        if existing_suggestion:
            continue

        # Skip if recently rejected
        rejected = db.query(ScheduleSuggestion).filter(
            ScheduleSuggestion.recipient == representative,
            ScheduleSuggestion.status == SuggestionStatus.rejected,
            ScheduleSuggestion.rejected_until > datetime.now(timezone.utc),
        ).first()
        if rejected:
            continue

        suggestion = ScheduleSuggestion(
            recipient=representative,
            amount=round(avg_amount, 2),
            interval=interval,
            match_count=len(txns),
        )
        db.add(suggestion)
        created += 1

    if created:
        db.commit()
    return created
