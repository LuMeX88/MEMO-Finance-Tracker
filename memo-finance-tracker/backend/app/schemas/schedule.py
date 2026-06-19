from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.schedule import IntervalType


class ScheduleBase(BaseModel):
    name: str
    amount: float
    is_variable: bool = False
    estimated_amount: Optional[float] = None
    interval: IntervalType
    next_due_date: date
    category_id: int
    active: bool = True


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    is_variable: Optional[bool] = None
    estimated_amount: Optional[float] = None
    interval: Optional[IntervalType] = None
    next_due_date: Optional[date] = None
    category_id: Optional[int] = None
    active: Optional[bool] = None


class ScheduleResponse(ScheduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
