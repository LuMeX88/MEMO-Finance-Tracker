from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.settings import AppSettings
from app.schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

_SETTINGS_ID = 1
_ALLOWED_LANGUAGES = {"de", "en"}
_ALLOWED_THEMES = {"light", "dark"}


def get_or_create_settings(db: Session) -> AppSettings:
    """Return the single settings row, creating it with defaults if absent."""
    settings = db.query(AppSettings).filter(AppSettings.id == _SETTINGS_ID).first()
    if settings is None:
        settings = AppSettings(id=_SETTINGS_ID)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=SettingsResponse)
def read_settings(db: Session = Depends(get_db)):
    return get_or_create_settings(db)


@router.put("", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)

    if "language" in data and data["language"] not in _ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")
    if "theme" in data and data["theme"] not in _ALLOWED_THEMES:
        raise HTTPException(status_code=400, detail="Unsupported theme")

    for key, value in data.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings
