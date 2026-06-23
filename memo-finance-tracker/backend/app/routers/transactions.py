from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.schemas.transaction import TransactionCreate, TransactionResponse, TransactionUpdate
from app.services.ai import ai_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=List[TransactionResponse])
def list_transactions(
    start_date: Optional[date] = Query(None, description="Filter by start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="Filter by end date (inclusive)"),
    category_id: Optional[int] = Query(None, description="Filter by category"),
    project_id: Optional[int] = Query(None, description="Filter by project"),
    type: Optional[TransactionType] = Query(None, description="Filter by type: income or expense"),
    recipient: Optional[str] = Query(None, description="Filter by recipient / merchant (substring)"),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Max rows to return"),
    offset: int = Query(0, ge=0, description="Rows to skip before returning results"),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction)
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if project_id is not None:
        query = query.filter(Transaction.project_id == project_id)
    if type is not None:
        query = query.filter(Transaction.type == type)
    if recipient:
        query = query.filter(Transaction.recipient.ilike(f"%{recipient}%"))
    query = query.order_by(Transaction.date.desc(), Transaction.id.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    data = transaction.model_dump()
    if data.get("category_id") is None:
        data["category_id"] = _resolve_category(db, data.get("recipient", ""), data.get("note"))
    db_transaction = Transaction(**data)
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def _resolve_category(db: Session, recipient: str, note: Optional[str]) -> int:
    """Pick a category id for a transaction that has none.

    Tries the local AI classifier over the active categories; on any miss falls
    back to a sensible default ("Other" if present, else the first category).
    Guarantees a valid id because the column is NOT NULL.
    """
    categories = db.query(Category).filter(Category.archived.is_(False)).all()
    if not categories:
        categories = db.query(Category).all()
    if not categories:
        raise HTTPException(status_code=400, detail="No categories available")

    by_name = {c.name: c for c in categories}
    description = " ".join(filter(None, [recipient, note or ""])).strip()
    suggestion = ai_service.categorize(description, list(by_name.keys())) if description else None
    if suggestion and suggestion in by_name:
        return by_name[suggestion].id

    default = by_name.get("Other") or categories[0]
    return default.id


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return db_transaction


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int, transaction: TransactionUpdate, db: Session = Depends(get_db)
):
    db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for key, value in transaction.model_dump(exclude_unset=True).items():
        setattr(db_transaction, key, value)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(db_transaction)
    db.commit()
