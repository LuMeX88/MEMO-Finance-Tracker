"""Forecast endpoint: project future expenses from schedules + historical averages."""
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.schedule import Schedule, IntervalType
from app.models.transaction import Transaction, TransactionType
from app.models.project import Project, ProjectColumn, ProjectTask

router = APIRouter(prefix="/forecast", tags=["forecast"])


class ForecastItem(BaseModel):
    """A single line that contributes to a month's forecast total."""
    kind: str                       # 'fixed' | 'variable' | 'project' | 'average'
    name: str
    amount: float
    interval: Optional[str] = None        # schedules: weekly/monthly/yearly
    occurrences: Optional[int] = None     # schedules: times it fires this month
    project_name: Optional[str] = None    # project tasks
    due_date: Optional[str] = None        # project tasks: ISO end date


class MonthForecast(BaseModel):
    year: int
    month: int
    label: str          # "Jul 2026"
    scheduled_fixed: float
    scheduled_variable: float
    scheduled_project: float   # planned (not-yet-booked) project task costs
    variable_avg: float
    total: float
    is_current: bool    # True = this is the current calendar month
    items: List[ForecastItem]  # everything counted into `total`


class ForecastResponse(BaseModel):
    months: List[MonthForecast]
    variable_monthly_avg: float
    variable_avg_basis_months: int   # how many past months the average is based on


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
    months = max(1, min(months, 24))

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
    variable_avg = round(variable_avg, 2)

    # ── Active schedules ──
    schedules = db.query(Schedule).filter(Schedule.active == True).all()

    # ── Project task forecasts ──
    # Un-booked task costs (those that have NOT yet become a real transaction)
    # are placed into the month of their estimated completion date (end_date).
    # Tasks without a date can't be time-forecast and are ignored (this is why
    # the Kanban board now exposes an estimated-done date). Overdue-but-unbooked
    # costs roll forward into the current month so they aren't lost.
    all_projects = db.query(Project).all()
    project_modes = {p.id: p.mode for p in all_projects}
    project_names = {p.id: p.name for p in all_projects}
    done_col_ids = {
        c.id
        for c in db.query(ProjectColumn)
        .filter(ProjectColumn.is_done == True)
        .all()
    }
    current_ym = (today.year, today.month)
    project_items_by_month: dict[tuple, List[ForecastItem]] = {}
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
        project_items_by_month.setdefault(bucket, []).append(
            ForecastItem(
                kind="project",
                name=tk.title,
                amount=round(tk.cost, 2),
                project_name=project_names.get(tk.project_id),
                due_date=tk.end_date.isoformat(),
            )
        )

    # ── Build month-by-month forecast ──
    # A 1-month horizon means "next month" (the upcoming calendar month); longer
    # horizons start at the current month to give a rolling outlook.
    result_months: List[MonthForecast] = []
    start_offset = 1 if months == 1 else 0
    y, m = today.year, today.month
    for _ in range(start_offset):
        m += 1
        if m > 12:
            m = 1
            y += 1

    for _ in range(months):
        is_current = (y == today.year and m == today.month)
        items: List[ForecastItem] = []
        fixed_total = 0.0
        variable_total = 0.0

        for s in schedules:
            occ = _occurrences_in_month(s.interval, s.next_due_date, y, m)
            if occ == 0:
                continue
            amt = s.estimated_amount if (s.is_variable and s.estimated_amount) else s.amount
            line = round(amt * occ, 2)
            if s.is_variable:
                variable_total += line
                items.append(ForecastItem(
                    kind="variable", name=s.name, amount=line,
                    interval=s.interval.value, occurrences=occ,
                ))
            else:
                fixed_total += line
                items.append(ForecastItem(
                    kind="fixed", name=s.name, amount=line,
                    interval=s.interval.value, occurrences=occ,
                ))

        proj_items = project_items_by_month.get((y, m), [])
        proj_fc = round(sum(it.amount for it in proj_items), 2)
        items.extend(proj_items)

        # Estimated variable spending (based on the historical average) applies
        # to every forecast month so the projection isn't only the fixed costs.
        if variable_avg > 0:
            items.append(ForecastItem(
                kind="average", name="", amount=variable_avg,
            ))

        total = round(fixed_total + variable_total + proj_fc + variable_avg, 2)

        result_months.append(MonthForecast(
            year=y, month=m,
            label=_month_label(y, m),
            scheduled_fixed=round(fixed_total, 2),
            scheduled_variable=round(variable_total, 2),
            scheduled_project=proj_fc,
            variable_avg=variable_avg,
            total=total,
            is_current=is_current,
            items=items,
        ))

        # Advance month
        m += 1
        if m > 12:
            m = 1
            y += 1

    return ForecastResponse(
        months=result_months,
        variable_monthly_avg=variable_avg,
        variable_avg_basis_months=len(hist_totals),
    )
