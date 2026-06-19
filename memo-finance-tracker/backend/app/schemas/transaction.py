from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.transaction import TransactionType


class TransactionBase(BaseModel):
    date: date
    recipient: str
    category_id: int
    amount: float
    type: TransactionType
    project_id: Optional[int] = None
    payment_method: Optional[str] = None
    note: Optional[str] = None
    receipt_path: Optional[str] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    recipient: Optional[str] = None
    category_id: Optional[int] = None
    amount: Optional[float] = None
    type: Optional[TransactionType] = None
    project_id: Optional[int] = None
    payment_method: Optional[str] = None
    note: Optional[str] = None
    receipt_path: Optional[str] = None


class TransactionResponse(TransactionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
