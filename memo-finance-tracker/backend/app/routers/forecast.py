"""Forecast endpoint: project future expenses from schedules + historical averages."""
from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.schedule import Schedule, IntervalType
from app.models.transaction import Transaction, TransactionType
from app.models.project import Project, ProjectColumn, ProjectTask

router = APIRouter(prefix="/forecast", tags=["forecast"])


class MonthForecast(BaseModel):
    year: int
    month: int
    label: str          # "Jul 2026"
    scheduled_fixed: float
    scheduled_variable: float
    scheduled_project: float   # planned (not-yet-booked) project task costs
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

    # ── Project task forecasts ──
    # Un-booked task costs (those that have NOT yet become a real transaction)
    # are placed into the month of their estimated completion date (end_date).
    # Tasks without a date can't be time-forecast and are ignored (this is why
    # the Kanban board now exposes an estimated-done date). Overdue-but-unbooked
    # costs roll forward into the current month so they aren't lost.
    project_modes = {p.id: p.mode for p in db.query(Project).all()}
    done_col_ids = {
        c.id
        for c in db.query(ProjectColumn)
        .filter(ProjectColumn.is_done == True)
        .all()
    }
    current_ym = (today.year, today.month)
    project_forecast_by_month: dict[tuple, float] = {}
    forecast_tasks = (
        db.query(ProjectTask)
        .filter(ProjectTask.cost > 0, ProjectTask.end_date.isnot(None))
        .all()
    )
    for tk in forecast_tasks:
        mode = project_modes.get(tk.project_id)
        if mode == "waterfall":
            booked = tk.end_date < today
        else:
            booked = tk.column_id in done_col_ids
        if booked:
            continue  # already mirrored into a real transaction
        bucket = max((tk.end_date.year, tk.end_date.month), current_ym)
        project_forecast_by_month[bucket] = (
            project_forecast_by_month.get(bucket, 0.0) + tk.cost
        )

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

        proj_fc = project_forecast_by_month.get((y, m), 0.0)

        if is_past:
            actual = hist_totals.get((y, m), 0)
            result_months.append(MonthForecast(
                year=y, month=m,
                label=_month_label(y, m),
                scheduled_fixed=fixed_total,
                scheduled_variable=variable_total,
                scheduled_project=0.0,
                variable_avg=actual,
                total=actual,
                is_past=True,
            ))
        elif is_current:
            actual = hist_totals.get((y, m), 0)
            result_months.append(MonthForecast(
                year=y, month=m,
                label=_month_label(y, m),
                scheduled_fixed=fixed_total,
                scheduled_variable=variable_total,
                scheduled_project=proj_fc,
                variable_avg=actual,
                total=fixed_total + variable_total + variable_avg + proj_fc,
                is_past=False,
            ))
        else:
            result_months.append(MonthForecast(
                year=y, month=m,
                label=_month_label(y, m),
                scheduled_fixed=fixed_total,
                scheduled_variable=variable_total,
                scheduled_project=proj_fc,
                variable_avg=variable_avg,
                total=fixed_total + variable_total + variable_avg + proj_fc,
                is_past=False,
            ))

        # Advance month
        m += 1
        if m > 12:
            m = 1
            y += 1

    return ForecastResponse(months=result_months, variable_monthly_avg=round(variable_avg, 2))
