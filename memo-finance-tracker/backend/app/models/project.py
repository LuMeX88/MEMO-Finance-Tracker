from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    budget = Column(Float, nullable=True)
    end_date = Column(Date, nullable=True)
    # Project management method: "kanban" (status columns) or "waterfall" (dates).
    mode = Column(String, nullable=False, default="kanban")
    archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    transactions = relationship("Transaction", back_populates="project")
    columns = relationship(
        "ProjectColumn",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectColumn.position",
    )
    tasks = relationship(
        "ProjectTask",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectColumn(Base):
    """A Kanban column (e.g. To Do / In Progress / Done) inside a project board."""

    __tablename__ = "project_columns"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id"), nullable=False, index=True
    )
    name = Column(String, nullable=False)
    position = Column(Integer, nullable=False, default=0)
    # When a task sits in a column flagged as "done", its cost counts as booked
    # (actual) rather than forecast.
    is_done = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    project = relationship("Project", back_populates="columns")
    tasks = relationship("ProjectTask", back_populates="column")


class ProjectTask(Base):
    """A work package. Costs are forecast or booked depending on the project mode.

    - Kanban:    booked once the task is in a column flagged ``is_done``.
    - Waterfall: booked once today is past the planned ``end_date``.
    """

    __tablename__ = "project_tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id"), nullable=False, index=True
    )
    column_id = Column(
        Integer, ForeignKey("project_columns.id"), nullable=True, index=True
    )
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    cost = Column(Float, nullable=False, default=0.0)
    # Optional category for the cost. When the task is booked, the auto-created
    # expense transaction is filed under this category (falls back to a default
    # like "Other" when unset) so project costs show up correctly in reports.
    category_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    start_date = Column(Date, nullable=True)
    # For Kanban this doubles as the *estimated completion date* used to place
    # the (not-yet-booked) cost into the time-based expense forecast.
    end_date = Column(Date, nullable=True)
    position = Column(Integer, nullable=False, default=0)
    # When a task's cost is "booked" it is mirrored into a real expense
    # transaction so it shows up in the bookings list, reports and budget bars.
    # This holds the id of that auto-managed transaction (cleared when unbooked).
    transaction_id = Column(
        Integer, ForeignKey("transactions.id"), nullable=True, index=True
    )
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    project = relationship("Project", back_populates="tasks")
    column = relationship("ProjectColumn", back_populates="tasks")
