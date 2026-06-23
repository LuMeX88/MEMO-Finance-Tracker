from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project, ProjectColumn, ProjectTask
from app.models.transaction import Transaction, TransactionType
from app.schemas.project import (
    ProjectBoardResponse,
    ProjectColumnCreate,
    ProjectColumnResponse,
    ProjectColumnUpdate,
    ProjectCostSummary,
    ProjectCreate,
    ProjectResponse,
    ProjectTaskCreate,
    ProjectTaskResponse,
    ProjectTaskUpdate,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])

# Columns every new Kanban board starts with. "Done" is flagged so that any task
# resting there is treated as a booked (actual) cost rather than a forecast.
_DEFAULT_COLUMNS = [
    {"name": "To Do", "position": 0, "is_done": False},
    {"name": "In Progress", "position": 1, "is_done": False},
    {"name": "Done", "position": 2, "is_done": True},
]


# ── Helpers ────────────────────────────────────────────────────────────────────


def _get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _seed_default_columns(db: Session, project_id: int) -> None:
    for data in _DEFAULT_COLUMNS:
        db.add(ProjectColumn(project_id=project_id, **data))
    db.commit()


def _task_is_booked(
    task: ProjectTask,
    project: Project,
    columns_by_id: Dict[int, ProjectColumn],
    today: date,
) -> bool:
    """Forecast vs booked: by 'done' column (Kanban) or past end date (Waterfall)."""
    if project.mode == "waterfall":
        return task.end_date is not None and task.end_date < today
    column = columns_by_id.get(task.column_id) if task.column_id else None
    return bool(column and column.is_done)


def _serialize_task(
    task: ProjectTask,
    project: Project,
    columns_by_id: Dict[int, ProjectColumn],
    today: date,
) -> ProjectTaskResponse:
    resp = ProjectTaskResponse.model_validate(task)
    resp.booked = _task_is_booked(task, project, columns_by_id, today)
    return resp


def _next_task_position(db: Session, project_id: int, column_id: Optional[int]) -> int:
    count = (
        db.query(func.count(ProjectTask.id))
        .filter(
            ProjectTask.project_id == project_id,
            ProjectTask.column_id == column_id,
        )
        .scalar()
    )
    return int(count or 0)


# ── Projects CRUD ──────────────────────────────────────────────────────────────


@router.get("", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.name).all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    # Every project gets a Kanban board out of the box (used by Kanban mode and
    # available if the user switches a Waterfall project over later).
    _seed_default_columns(db, db_project.id)
    db.refresh(db_project)
    return db_project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _get_project_or_404(db, project_id)


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int, project: ProjectUpdate, db: Session = Depends(get_db)
):
    db_project = _get_project_or_404(db, project_id)
    for key, value in project.model_dump(exclude_unset=True).items():
        setattr(db_project, key, value)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    db_project = _get_project_or_404(db, project_id)
    db.delete(db_project)
    db.commit()


# ── Board (project detail with cost rollup) ────────────────────────────────────


@router.get("/{project_id}/board", response_model=ProjectBoardResponse)
def get_project_board(project_id: int, db: Session = Depends(get_db)):
    project = _get_project_or_404(db, project_id)

    columns = (
        db.query(ProjectColumn)
        .filter(ProjectColumn.project_id == project_id)
        .order_by(ProjectColumn.position, ProjectColumn.id)
        .all()
    )
    # Lazily seed a board for projects created before the feature existed.
    if not columns:
        _seed_default_columns(db, project_id)
        columns = (
            db.query(ProjectColumn)
            .filter(ProjectColumn.project_id == project_id)
            .order_by(ProjectColumn.position, ProjectColumn.id)
            .all()
        )

    tasks = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.position, ProjectTask.id)
        .all()
    )

    today = date.today()
    columns_by_id = {c.id: c for c in columns}
    task_responses = [_serialize_task(t, project, columns_by_id, today) for t in tasks]

    booked_cost = sum(t.cost for t, r in zip(tasks, task_responses) if r.booked)
    forecast_cost = sum(t.cost for t, r in zip(tasks, task_responses) if not r.booked)

    spent = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0.0))
        .filter(
            Transaction.project_id == project_id,
            Transaction.type == TransactionType.expense,
        )
        .scalar()
    )

    summary = ProjectCostSummary(
        budget=project.budget,
        forecast_cost=round(forecast_cost, 2),
        booked_cost=round(booked_cost, 2),
        planned_cost=round(forecast_cost + booked_cost, 2),
        spent=round(float(spent or 0.0), 2),
        task_count=len(tasks),
    )

    return ProjectBoardResponse(
        project=ProjectResponse.model_validate(project),
        columns=[ProjectColumnResponse.model_validate(c) for c in columns],
        tasks=task_responses,
        summary=summary,
    )


# ── Columns ────────────────────────────────────────────────────────────────────


@router.post(
    "/{project_id}/columns",
    response_model=ProjectColumnResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_column(
    project_id: int, column: ProjectColumnCreate, db: Session = Depends(get_db)
):
    _get_project_or_404(db, project_id)
    max_pos = (
        db.query(func.max(ProjectColumn.position))
        .filter(ProjectColumn.project_id == project_id)
        .scalar()
    )
    db_column = ProjectColumn(
        project_id=project_id,
        name=column.name,
        is_done=column.is_done,
        position=(max_pos + 1) if max_pos is not None else 0,
    )
    db.add(db_column)
    db.commit()
    db.refresh(db_column)
    return db_column


@router.put("/{project_id}/columns/{column_id}", response_model=ProjectColumnResponse)
def update_column(
    project_id: int,
    column_id: int,
    column: ProjectColumnUpdate,
    db: Session = Depends(get_db),
):
    db_column = (
        db.query(ProjectColumn)
        .filter(
            ProjectColumn.id == column_id, ProjectColumn.project_id == project_id
        )
        .first()
    )
    if not db_column:
        raise HTTPException(status_code=404, detail="Column not found")
    for key, value in column.model_dump(exclude_unset=True).items():
        setattr(db_column, key, value)
    db.commit()
    db.refresh(db_column)
    return db_column


@router.delete(
    "/{project_id}/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_column(project_id: int, column_id: int, db: Session = Depends(get_db)):
    db_column = (
        db.query(ProjectColumn)
        .filter(
            ProjectColumn.id == column_id, ProjectColumn.project_id == project_id
        )
        .first()
    )
    if not db_column:
        raise HTTPException(status_code=404, detail="Column not found")

    remaining = (
        db.query(ProjectColumn)
        .filter(
            ProjectColumn.project_id == project_id, ProjectColumn.id != column_id
        )
        .order_by(ProjectColumn.position, ProjectColumn.id)
        .all()
    )
    if not remaining:
        raise HTTPException(
            status_code=400, detail="A project must keep at least one column"
        )

    # Move this column's tasks to the first remaining column rather than deleting them.
    target = remaining[0]
    db.query(ProjectTask).filter(ProjectTask.column_id == column_id).update(
        {ProjectTask.column_id: target.id}, synchronize_session=False
    )
    db.delete(db_column)
    db.commit()


# ── Tasks ──────────────────────────────────────────────────────────────────────


@router.post(
    "/{project_id}/tasks",
    response_model=ProjectTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    project_id: int, task: ProjectTaskCreate, db: Session = Depends(get_db)
):
    project = _get_project_or_404(db, project_id)

    column_id = task.column_id
    if column_id is not None:
        valid = (
            db.query(ProjectColumn)
            .filter(
                ProjectColumn.id == column_id,
                ProjectColumn.project_id == project_id,
            )
            .first()
        )
        if not valid:
            raise HTTPException(status_code=400, detail="Invalid column")
    else:
        # Default new Kanban tasks into the first column.
        first = (
            db.query(ProjectColumn)
            .filter(ProjectColumn.project_id == project_id)
            .order_by(ProjectColumn.position, ProjectColumn.id)
            .first()
        )
        column_id = first.id if first else None

    db_task = ProjectTask(
        project_id=project_id,
        column_id=column_id,
        title=task.title,
        description=task.description,
        cost=task.cost,
        start_date=task.start_date,
        end_date=task.end_date,
        position=_next_task_position(db, project_id, column_id),
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    columns_by_id = {
        c.id: c
        for c in db.query(ProjectColumn)
        .filter(ProjectColumn.project_id == project_id)
        .all()
    }
    return _serialize_task(db_task, project, columns_by_id, date.today())


@router.put("/{project_id}/tasks/{task_id}", response_model=ProjectTaskResponse)
def update_task(
    project_id: int,
    task_id: int,
    task: ProjectTaskUpdate,
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(db, project_id)
    db_task = (
        db.query(ProjectTask)
        .filter(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
        .first()
    )
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    data = task.model_dump(exclude_unset=True)

    # Moving to another column: validate it and append to the end of that column.
    if "column_id" in data and data["column_id"] != db_task.column_id:
        new_column_id = data["column_id"]
        if new_column_id is not None:
            valid = (
                db.query(ProjectColumn)
                .filter(
                    ProjectColumn.id == new_column_id,
                    ProjectColumn.project_id == project_id,
                )
                .first()
            )
            if not valid:
                raise HTTPException(status_code=400, detail="Invalid column")
        if "position" not in data:
            data["position"] = _next_task_position(db, project_id, new_column_id)

    for key, value in data.items():
        setattr(db_task, key, value)
    db.commit()
    db.refresh(db_task)

    columns_by_id = {
        c.id: c
        for c in db.query(ProjectColumn)
        .filter(ProjectColumn.project_id == project_id)
        .all()
    }
    return _serialize_task(db_task, project, columns_by_id, date.today())


@router.delete(
    "/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_task(project_id: int, task_id: int, db: Session = Depends(get_db)):
    db_task = (
        db.query(ProjectTask)
        .filter(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
        .first()
    )
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(db_task)
    db.commit()
