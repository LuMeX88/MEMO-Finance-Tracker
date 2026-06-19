"""Forecast endpoint: project future expenses from schedules + historical averages."""
from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.schedule import Schedule, IntervalType
from app.models.transaction import Transaction, TransactionType

router = APIRouter(prefix="/forecast", tags=["forecast"])


class MonthForecast(BaseModel):
    year: int
    month: int
    label: str          # "Jul 2026"
    scheduled_fixed: float
    scheduled_variable: float
    variable_avg: float
    total: float
    is_past: bool       # True = actuals available


class ForecastResponse(BaseModel):
    months: List[MonthForecast]
    variable_monthly_avg: float


def _month_label(y: int, m: int) -> str:
    from calendar import month_abbr
    return f"{month_abbr[m]} {y}"


def _occurrences_in_month(interval: IntervalType, next_due: date, year: int, month: int) -> int:
    """Count how many times a schedule fires in a given month."""
    from calendar import monthrange
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    count = 0

    if interval == IntervalType.weekly:
        # Find first occurrence on or before end of month, then count forward
        cur = next_due
        while cur > last:
            cur -= timedelta(weeks=1)
        while cur < first:
            cur += timedelta(weeks=1)
        while cur <= last:
            count += 1
            cur += timedelta(weeks=1)
    elif interval == IntervalType.monthly:
        # fires once per month if day matches approximately
        count = 1
    elif interval == IntervalType.yearly:
        if next_due.month == month:
            count = 1

    return count


@router.get("", response_model=ForecastResponse)
def get_forecast(months: int = 6, db: Session = Depends(get_db)):
    today = date.today()

    # ── Historical variable avg (last 6 months, exclude current month) ──
    six_months_ago = date(today.year, today.month, 1) - timedelta(days=180)
    hist_totals: dict[tuple, float] = {}
    hist_txns = (
        db.query(Transaction)
        .filter(
            Transaction.type == TransactionType.expense,
            Transaction.date >= six_months_ago,
            Transaction.date < date(today.year, today.month, 1),
        )
        .all()
    )
    for t in hist_txns:
        key = (t.date.year, t.date.month)
        hist_totals[key] = hist_totals.get(key, 0) + t.amount

    variable_avg = sum(hist_totals.values()) / max(len(hist_totals), 1)

    # ── Active schedules ──
    schedules = db.query(Schedule).filter(Schedule.active == True).all()

    # ── Build month-by-month forecast ──
    result_months: List[MonthForecast] = []
    y, m = today.year, today.month

    for _ in range(months):
        is_past = (y < today.year) or (y == today.year and m < today.month)
        is_current = (y == today.year and m == today.month)

        fixed_total = 0.0
        variable_total = 0.0

        for s in schedules:
            occ = _occurrences_in_month(s.interval, s.next_due_date, y, m)
            if occ == 0:
                continue
            amt = s.estimated_amount if (s.is_variable and s.estimated_amount) else s.amount
            if s.is_variable:
                variable_total += amt * occ
            else:
                fixed_total += amt * occ

        if is_past or is_current:
            actual = hist_totals.get((y, m), 0)
            result_months.append(MonthForecast(
                year=y, month=m,
                label=_month_label(y, m),
                scheduled_fixed=fixed_total,
                scheduled_variable=variable_total,
                variable_avg=actual,
                total=actual if is_past else fixed_total + variable_total + variable_avg,
                is_past=is_past,
            ))
        else:
            result_months.append(MonthForecast(
                year=y, month=m,
                label=_month_label(y, m),
                scheduled_fixed=fixed_total,
                scheduled_variable=variable_total,
                variable_avg=variable_avg,
                total=fixed_total + variable_total + variable_avg,
                is_past=False,
            ))

        # Advance month
        m += 1
        if m > 12:
            m = 1
            y += 1

    return ForecastResponse(months=result_months, variable_monthly_avg=round(variable_avg, 2))
