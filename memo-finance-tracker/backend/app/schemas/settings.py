from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SettingsBase(BaseModel):
    currency: str = "CHF"
    language: str = "de"
    theme: str = "light"
    default_category_id: Optional[int] = None


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    language: Optional[str] = None
    theme: Optional[str] = None
    default_category_id: Optional[int] = None


class SettingsResponse(SettingsBase):
    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime
