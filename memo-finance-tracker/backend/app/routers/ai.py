"""Local AI endpoints — status + on-demand monthly spending insight."""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.services.ai import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class AiEnabledRequest(BaseModel):
    enabled: bool


@router.get("/status")
def ai_status():
    """Report whether the local AI model is enabled, downloading, or ready."""
    return ai_service.status()


@router.post("/enabled")
def set_ai_enabled(payload: AiEnabledRequest):
    """Enable or disable the local AI at runtime (persisted across restarts)."""
    return ai_service.set_enabled(payload.enabled)


@router.post("/insight")
def ai_insight(
    currency: str = Query("", description="Currency symbol for the summary"),
    db: Session = Depends(get_db),
):
    """Generate a 2-3 sentence plain-language insight for the last 30 days."""
    if not ai_service.ready:
        raise HTTPException(status_code=503, detail="AI model is not ready")

    since = date.today() - timedelta(days=30)

    income = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0.0))
        .filter(Transaction.type == TransactionType.income, Transaction.date >= since)
        .scalar()
        or 0.0
    )
    expenses = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0.0))
        .filter(Transaction.type == TransactionType.expense, Transaction.date >= since)
        .scalar()
        or 0.0
    )

    top_rows = (
        db.query(Category.name, func.sum(Transaction.amount).label("total"))
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(Transaction.type == TransactionType.expense, Transaction.date >= since)
        .group_by(Category.id)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(3)
        .all()
    )
    top_categories = [{"name": name, "amount": float(total)} for name, total in top_rows]

    insight = ai_service.monthly_insight(
        {
            "total_income": float(income),
            "total_expenses": float(expenses),
            "currency": currency,
            "top_categories": top_categories,
        }
    )
    if not insight:
        raise HTTPException(status_code=503, detail="Could not generate insight")
    return {"insight": insight}
