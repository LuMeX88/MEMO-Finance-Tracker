from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from pydantic import BaseModel

router = APIRouter(prefix="/reports", tags=["reports"])


# ---------------------------------------------------------------------------
# Response schemas (local to reports – no circular imports)
# ---------------------------------------------------------------------------

class BiggestExpense(BaseModel):
    id: int
    date: date
    recipient: str
    amount: float
    category_id: int


class SummaryResponse(BaseModel):
    total_income: float
    total_expenses: float
    avg_per_month: float
    avg_per_transaction: float
    this_month_income: float
    this_month_expenses: float
    balance_this_month: float
    biggest_expense: Optional[BiggestExpense] = None


class CategoryTotalResponse(BaseModel):
    category_id: int
    category_name: str
    category_icon: str
    category_color: str
    total: float
    count: int


class DailyTotalResponse(BaseModel):
    date: date
    income: float
    expenses: float
    balance: float


class MonthData(BaseModel):
    month: str  # "YYYY-MM"
    income: float
    expenses: float
    balance: float


class ComparisonResponse(BaseModel):
    current_month: MonthData
    previous_month: MonthData
    same_month_last_year: MonthData


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _filter_transactions(
    db: Session,
    date_from: Optional[date],
    date_to: Optional[date],
) -> List[Transaction]:
    query = db.query(Transaction)
    if date_from:
        query = query.filter(Transaction.date >= date_from)
    if date_to:
        query = query.filter(Transaction.date <= date_to)
    return query.all()


def _month_totals(db: Session, year: int, month: int) -> MonthData:
    txns = (
        db.query(Transaction)
        .filter(
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
        )
        .all()
    )
    income = sum(t.amount for t in txns if t.type == TransactionType.income)
    expenses = sum(abs(t.amount) for t in txns if t.type == TransactionType.expense)
    return MonthData(
        month=f"{year}-{month:02d}",
        income=round(income, 2),
        expenses=round(expenses, 2),
        balance=round(income - expenses, 2),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    txns = _filter_transactions(db, date_from, date_to)

    total_income = sum(t.amount for t in txns if t.type == TransactionType.income)
    total_expenses = sum(abs(t.amount) for t in txns if t.type == TransactionType.expense)

    avg_per_transaction = (
        sum(abs(t.amount) for t in txns) / len(txns) if txns else 0.0
    )

    # avg_per_month – based on the date range or the span of actual data
    if txns:
        if date_from and date_to:
            months = (
                (date_to.year - date_from.year) * 12
                + (date_to.month - date_from.month)
                + 1
            )
        else:
            dates = [t.date for t in txns]
            lo, hi = min(dates), max(dates)
            months = (hi.year - lo.year) * 12 + (hi.month - lo.month) + 1
        avg_per_month = total_expenses / months if months > 0 else total_expenses
    else:
        avg_per_month = 0.0

    # This-month figures always based on calendar month (not filters)
    today = date.today()
    this_month = _month_totals(db, today.year, today.month)

    # Biggest expense in the filtered set
    expense_txns = [t for t in txns if t.type == TransactionType.expense]
    biggest_expense: Optional[BiggestExpense] = None
    if expense_txns:
        b = max(expense_txns, key=lambda t: abs(t.amount))
        biggest_expense = BiggestExpense(
            id=b.id,
            date=b.date,
            recipient=b.recipient,
            amount=b.amount,
            category_id=b.category_id,
        )

    return SummaryResponse(
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        avg_per_month=round(avg_per_month, 2),
        avg_per_transaction=round(avg_per_transaction, 2),
        this_month_income=this_month.income,
        this_month_expenses=this_month.expenses,
        balance_this_month=this_month.balance,
        biggest_expense=biggest_expense,
    )


@router.get("/by-category", response_model=List[CategoryTotalResponse])
def get_by_category(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(Transaction.type == TransactionType.expense)
    if date_from:
        query = query.filter(Transaction.date >= date_from)
    if date_to:
        query = query.filter(Transaction.date <= date_to)

    txns = query.all()

    # Aggregate by category
    agg: Dict[int, Dict[str, Any]] = {}
    for t in txns:
        if t.category_id not in agg:
            agg[t.category_id] = {"total": 0.0, "count": 0, "cat": t.category}
        agg[t.category_id]["total"] += abs(t.amount)
        agg[t.category_id]["count"] += 1

    result = []
    for cat_id, data in agg.items():
        cat = data["cat"]
        result.append(
            CategoryTotalResponse(
                category_id=cat_id,
                category_name=cat.name if cat else "Unknown",
                category_icon=cat.icon if cat else "",
                category_color=cat.color if cat else "#000000",
                total=round(data["total"], 2),
                count=data["count"],
            )
        )

    return sorted(result, key=lambda x: x.total, reverse=True)


@router.get("/timeline", response_model=List[DailyTotalResponse])
def get_timeline(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    txns = _filter_transactions(db, date_from, date_to)

    daily: Dict[date, Dict[str, float]] = {}
    for t in txns:
        d = t.date
        if d not in daily:
            daily[d] = {"income": 0.0, "expenses": 0.0}
        if t.type == TransactionType.income:
            daily[d]["income"] += t.amount
        else:
            daily[d]["expenses"] += abs(t.amount)

    return [
        DailyTotalResponse(
            date=d,
            income=round(daily[d]["income"], 2),
            expenses=round(daily[d]["expenses"], 2),
            balance=round(daily[d]["income"] - daily[d]["expenses"], 2),
        )
        for d in sorted(daily)
    ]


@router.get("/comparison", response_model=ComparisonResponse)
def get_comparison(db: Session = Depends(get_db)):
    today = date.today()

    current = _month_totals(db, today.year, today.month)

    prev_year = today.year if today.month > 1 else today.year - 1
    prev_month = today.month - 1 if today.month > 1 else 12
    previous = _month_totals(db, prev_year, prev_month)

    same_last_year = _month_totals(db, today.year - 1, today.month)

    return ComparisonResponse(
        current_month=current,
        previous_month=previous,
        same_month_last_year=same_last_year,
    )
