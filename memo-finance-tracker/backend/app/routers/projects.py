from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.project import Project, ProjectColumn, ProjectTask
from app.models.transaction import Transaction, TransactionType
from app.schemas.project import (
    ProjectBoardResponse,
    ProjectColumnCreate,
    ProjectColumnResponse,
    ProjectColumnUpdate,
    ProjectCostSummary,
    ProjectCostSummaryItem,
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


# ── Booked-cost ⇄ transaction synchronisation ─────────────────────────────────
#
# A task's cost only becomes "real" money once it is booked (Kanban: in a done
# column; Waterfall: past its end date). To make that money visible everywhere
# the rest of the app already looks (the bookings list, reports, the project
# budget bars) we mirror every booked task into an ordinary expense transaction
# and keep the two in sync. Forecast (not-yet-booked) tasks have no transaction.


def _default_category_id(db: Session) -> Optional[int]:
    """Category used for auto-generated task transactions (prefers 'Other')."""
    cat = (
        db.query(Category)
        .filter(func.lower(Category.name) == "other")
        .order_by(Category.id)
        .first()
    )
    if cat is None:
        cat = db.query(Category).order_by(Category.id).first()
    return cat.id if cat else None


def _sync_task_transaction(
    db: Session,
    task: ProjectTask,
    project: Project,
    columns_by_id: Dict[int, ProjectColumn],
    today: date,
    default_category_id: Optional[int],
    valid_category_ids: set,
) -> None:
    """Create / update / remove the expense transaction mirroring a booked task."""
    booked = _task_is_booked(task, project, columns_by_id, today)

    tx: Optional[Transaction] = None
    if task.transaction_id is not None:
        tx = (
            db.query(Transaction)
            .filter(Transaction.id == task.transaction_id)
            .first()
        )
        if tx is None:
            # The mirrored transaction was deleted elsewhere — forget the link.
            task.transaction_id = None

    should_book = booked and task.cost is not None and task.cost > 0

    # The task's category is only usable if it still exists (a category the task
    # referenced may have been deleted); otherwise fall back to the default.
    task_category_id = (
        task.category_id if task.category_id in valid_category_ids else None
    )

    if should_book:
        tx_date = (
            task.end_date
            if (project.mode == "waterfall" and task.end_date is not None)
            else today
        )
        recipient = (task.title or "Task").strip()[:200] or "Task"
        # File the booking under the task's category if it has one, otherwise the
        # default ("Other"). This is what makes project costs show up under the
        # right category in the reports instead of all landing in "Other".
        category_id = task_category_id or default_category_id
        if tx is None:
            if category_id is None:
                return  # no categories exist yet; nothing we can attach to
            tx = Transaction(
                date=tx_date,
                recipient=recipient,
                category_id=category_id,
                amount=float(task.cost),
                type=TransactionType.expense,
                project_id=project.id,
                note=project.name,
            )
            db.add(tx)
            db.flush()  # assign tx.id
            task.transaction_id = tx.id
        else:
            # Keep amount / label / project in sync. The booking date for Kanban
            # is left untouched (user may re-date it). The category follows the
            # task's category when set; if the task has no category we leave the
            # existing one so a manual re-filing on the booking is respected.
            tx.amount = float(task.cost)
            tx.recipient = recipient
            tx.project_id = project.id
            tx.type = TransactionType.expense
            if task_category_id is not None:
                tx.category_id = task_category_id
            if project.mode == "waterfall" and task.end_date is not None:
                tx.date = task.end_date
    else:
        if tx is not None:
            db.delete(tx)
        task.transaction_id = None


def _reconcile_project(db: Session, project: Project) -> None:
    """Sync every task's booked cost into transactions for one project."""
    columns = (
        db.query(ProjectColumn)
        .filter(ProjectColumn.project_id == project.id)
        .all()
    )
    columns_by_id = {c.id: c for c in columns}
    tasks = (
        db.query(ProjectTask).filter(ProjectTask.project_id == project.id).all()
    )
    today = date.today()
    default_category_id = _default_category_id(db)
    valid_category_ids = {cid for (cid,) in db.query(Category.id).all()}
    for task in tasks:
        _sync_task_transaction(
            db,
            task,
            project,
            columns_by_id,
            today,
            default_category_id,
            valid_category_ids,
        )
    db.commit()


def reconcile_all_projects(db: Session) -> None:
    """Reconcile booked-cost transactions for every project (used at startup)."""
    for project in db.query(Project).all():
        _reconcile_project(db, project)


def _project_spent(db: Session, project_id: int) -> float:
    spent = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0.0))
        .filter(
            Transaction.project_id == project_id,
            Transaction.type == TransactionType.expense,
        )
        .scalar()
    )
    return round(float(spent or 0.0), 2)


def _compute_summary(
    db: Session,
    project: Project,
    columns: List[ProjectColumn],
    tasks: List[ProjectTask],
    today: date,
) -> ProjectCostSummary:
    columns_by_id = {c.id: c for c in columns}
    booked_cost = 0.0
    forecast_cost = 0.0
    for task in tasks:
        if _task_is_booked(task, project, columns_by_id, today):
            booked_cost += task.cost or 0.0
        else:
            forecast_cost += task.cost or 0.0
    return ProjectCostSummary(
        budget=project.budget,
        forecast_cost=round(forecast_cost, 2),
        booked_cost=round(booked_cost, 2),
        planned_cost=round(forecast_cost + booked_cost, 2),
        spent=_project_spent(db, project.id),
        task_count=len(tasks),
    )


# ── Projects CRUD ──────────────────────────────────────────────────────────────


@router.get("", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.name).all()


@router.get("/cost-summary", response_model=List[ProjectCostSummaryItem])
def list_cost_summaries(db: Session = Depends(get_db)):
    """Per-project forecast/booked/spent rollup for the projects overview.

    Reconciles booked-cost transactions first so the numbers (and the bookings
    list / reports they feed) are always current — including Waterfall tasks
    whose end date has quietly passed.
    """
    projects = db.query(Project).order_by(Project.name).all()
    today = date.today()
    items: List[ProjectCostSummaryItem] = []
    for project in projects:
        _reconcile_project(db, project)
        columns = (
            db.query(ProjectColumn)
            .filter(ProjectColumn.project_id == project.id)
            .all()
        )
        tasks = (
            db.query(ProjectTask)
            .filter(ProjectTask.project_id == project.id)
            .all()
        )
        summary = _compute_summary(db, project, columns, tasks, today)
        items.append(
            ProjectCostSummaryItem(project_id=project.id, **summary.model_dump())
        )
    return items


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
    # Remove the auto-managed booked-cost transactions belonging to this
    # project's tasks (manual transactions are detached by the FK as before).
    task_tx_ids = [
        t.transaction_id
        for t in db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .all()
        if t.transaction_id is not None
    ]
    if task_tx_ids:
        db.query(Transaction).filter(Transaction.id.in_(task_tx_ids)).delete(
            synchronize_session=False
        )
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

    # Mirror booked task costs into transactions before reading anything back.
    _reconcile_project(db, project)

    tasks = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.position, ProjectTask.id)
        .all()
    )

    today = date.today()
    columns_by_id = {c.id: c for c in columns}
    task_responses = [_serialize_task(t, project, columns_by_id, today) for t in tasks]

    summary = _compute_summary(db, project, columns, tasks, today)

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
    # Toggling "done" flips booked status for the tasks in this column.
    _reconcile_project(db, _get_project_or_404(db, project_id))
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
    # Reassigned tasks may have changed booked status (e.g. moved off "Done").
    _reconcile_project(db, _get_project_or_404(db, project_id))


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

    if task.category_id is not None:
        cat = (
            db.query(Category).filter(Category.id == task.category_id).first()
        )
        if not cat:
            raise HTTPException(status_code=400, detail="Invalid category")

    db_task = ProjectTask(
        project_id=project_id,
        column_id=column_id,
        title=task.title,
        description=task.description,
        cost=task.cost,
        category_id=task.category_id,
        start_date=task.start_date,
        end_date=task.end_date,
        position=_next_task_position(db, project_id, column_id),
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    # A task can be born booked (Kanban into a done column, or a Waterfall task
    # whose end date is already in the past) — sync its transaction right away.
    _reconcile_project(db, project)
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

    # Validate a re-categorisation before applying it.
    if data.get("category_id") is not None:
        cat = (
            db.query(Category).filter(Category.id == data["category_id"]).first()
        )
        if not cat:
            raise HTTPException(status_code=400, detail="Invalid category")

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

    # Moving columns / changing cost or dates can flip booked status — resync.
    _reconcile_project(db, project)
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
    # Remove the auto-managed booked-cost transaction, if any.
    if db_task.transaction_id is not None:
        tx = (
            db.query(Transaction)
            .filter(Transaction.id == db_task.transaction_id)
            .first()
        )
        if tx is not None:
            db.delete(tx)
    db.delete(db_task)
    db.commit()
