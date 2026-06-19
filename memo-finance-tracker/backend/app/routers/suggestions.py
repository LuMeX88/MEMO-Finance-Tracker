"""Schedule suggestion endpoints."""
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.schedule_suggestion import ScheduleSuggestion, SuggestionStatus
from app.services.pattern_detector import run_pattern_detection

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


class SuggestionResponse(BaseModel):
    id: int
    recipient: str
    amount: float
    interval: str
    status: str
    match_count: int
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[SuggestionResponse])
def get_suggestions(db: Session = Depends(get_db)):
    return db.query(ScheduleSuggestion).filter(
        ScheduleSuggestion.status == SuggestionStatus.pending
    ).order_by(ScheduleSuggestion.created_at.desc()).all()


@router.post("/detect")
def detect_patterns(db: Session = Depends(get_db)):
    count = run_pattern_detection(db)
    return {"new_suggestions": count}


@router.post("/{id}/accept")
def accept_suggestion(id: int, db: Session = Depends(get_db)):
    s = db.query(ScheduleSuggestion).get(id)
    if not s:
        raise HTTPException(404)
    s.status = SuggestionStatus.accepted
    db.commit()
    return {"ok": True}


@router.post("/{id}/reject")
def reject_suggestion(id: int, db: Session = Depends(get_db)):
    s = db.query(ScheduleSuggestion).get(id)
    if not s:
        raise HTTPException(404)
    s.status = SuggestionStatus.rejected
    s.rejected_until = datetime.now(timezone.utc) + timedelta(days=180)
    db.commit()
    return {"ok": True}


@router.post("/{id}/snooze")
def snooze_suggestion(id: int, db: Session = Depends(get_db)):
    s = db.query(ScheduleSuggestion).get(id)
    if not s:
        raise HTTPException(404)
    s.status = SuggestionStatus.snoozed
    db.commit()
    return {"ok": True}
