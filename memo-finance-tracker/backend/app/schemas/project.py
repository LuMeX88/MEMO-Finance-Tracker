from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ProjectBase(BaseModel):
    name: str
    icon: Optional[str] = None
    budget: Optional[float] = None
    end_date: Optional[date] = None
    mode: str = "kanban"
    archived: bool = False


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    budget: Optional[float] = None
    end_date: Optional[date] = None
    mode: Optional[str] = None
    archived: Optional[bool] = None


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


# ── Kanban columns ─────────────────────────────────────────────────────────────


class ProjectColumnCreate(BaseModel):
    name: str
    is_done: bool = False


class ProjectColumnUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None
    is_done: Optional[bool] = None


class ProjectColumnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    position: int
    is_done: bool


# ── Work-package tasks ─────────────────────────────────────────────────────────


class ProjectTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    cost: float = 0.0
    column_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[float] = None
    column_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    position: Optional[int] = None


class ProjectTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    column_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    cost: float
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    position: int
    # Computed: whether the cost counts as booked (actual) vs forecast.
    booked: bool = False


# ── Board (project detail) ─────────────────────────────────────────────────────


class ProjectCostSummary(BaseModel):
    budget: Optional[float] = None
    forecast_cost: float
    booked_cost: float
    planned_cost: float
    spent: float
    task_count: int


class ProjectBoardResponse(BaseModel):
    project: ProjectResponse
    columns: List[ProjectColumnResponse]
    tasks: List[ProjectTaskResponse]
    summary: ProjectCostSummary
