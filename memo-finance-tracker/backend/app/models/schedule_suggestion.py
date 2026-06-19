import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum, Float, Integer, String
from app.database import Base


class SuggestionStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    snoozed = "snoozed"


class ScheduleSuggestion(Base):
    __tablename__ = "schedule_suggestions"
    id = Column(Integer, primary_key=True, index=True)
    recipient = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    interval = Column(String, nullable=False)  # weekly/monthly/yearly
    status = Column(Enum(SuggestionStatus), default=SuggestionStatus.pending, nullable=False)
    match_count = Column(Integer, default=2)
    rejected_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
