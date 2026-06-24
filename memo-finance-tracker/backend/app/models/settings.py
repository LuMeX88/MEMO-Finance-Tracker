from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base


class AppSettings(Base):
    """Single-row table holding the app-wide user preferences.

    Storing these server-side (instead of only in each browser's localStorage)
    means the web browser and the Home Assistant Companion app — which run in
    separate webviews with isolated storage — always show the same language and
    currency. The row is identified by a fixed primary key (``id == 1``).
    """

    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    currency = Column(String, nullable=False, default="CHF")
    language = Column(String, nullable=False, default="de")
    theme = Column(String, nullable=False, default="light")
    default_category_id = Column(Integer, nullable=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
