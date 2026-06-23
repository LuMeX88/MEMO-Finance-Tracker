from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.category import Category
from app.models.schedule import Schedule
from app.models.transaction import Transaction
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])

# Curated best-practice budgeting categories offered as one-click suggestions
# from the Settings page. Kept superset-compatible with the startup defaults so
# adding them on a fresh install simply skips the ones that already exist.
SUGGESTED_CATEGORIES = [
    {"name": "Housing", "icon": "🏠", "color": "#45B7D1"},
    {"name": "Groceries", "icon": "🛒", "color": "#FF6B6B"},
    {"name": "Food & Drinks", "icon": "🍔", "color": "#F97316"},
    {"name": "Transport", "icon": "🚌", "color": "#4ECDC4"},
    {"name": "Utilities", "icon": "💡", "color": "#FBBF24"},
    {"name": "Health", "icon": "💊", "color": "#96CEB4"},
    {"name": "Insurance", "icon": "🛡️", "color": "#60A5FA"},
    {"name": "Entertainment", "icon": "🎬", "color": "#FFEAA7"},
    {"name": "Shopping", "icon": "🛍️", "color": "#DDA0DD"},
    {"name": "Travel", "icon": "✈️", "color": "#98D8C8"},
    {"name": "Education", "icon": "📚", "color": "#A78BFA"},
    {"name": "Subscriptions", "icon": "🔁", "color": "#F472B6"},
    {"name": "Savings", "icon": "💰", "color": "#34D399"},
    {"name": "Income", "icon": "💼", "color": "#10B981"},
    {"name": "Gifts & Donations", "icon": "🎁", "color": "#FB7185"},
    {"name": "Other", "icon": "📦", "color": "#B0B0B0"},
]


@router.get("", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.name).all()


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    db_category = Category(**category.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


# NOTE: the "/suggested" routes MUST be declared before the "/{category_id}"
# routes below, otherwise Starlette would match "suggested" as a category id.
@router.post("/suggested")
def add_suggested_categories(db: Session = Depends(get_db)):
    """Add the best-practice categories, skipping any that already exist."""
    existing = {c.name.strip().lower() for c in db.query(Category).all()}
    created = 0
    for data in SUGGESTED_CATEGORIES:
        if data["name"].strip().lower() in existing:
            continue
        db.add(Category(**data))
        created += 1
    db.commit()
    return {"created": created, "skipped": len(SUGGESTED_CATEGORIES) - created}


@router.delete("/suggested")
def erase_suggested_categories(db: Session = Depends(get_db)):
    """Remove suggested categories that are not referenced by any data.

    Categories still used by a transaction or a schedule are kept to protect
    existing records.
    """
    names = {data["name"].strip().lower() for data in SUGGESTED_CATEGORIES}
    deleted = 0
    skipped = 0
    for category in db.query(Category).all():
        if category.name.strip().lower() not in names:
            continue
        in_use = (
            db.query(Transaction).filter(Transaction.category_id == category.id).first()
            or db.query(Schedule).filter(Schedule.category_id == category.id).first()
        )
        if in_use:
            skipped += 1
            continue
        db.delete(category)
        deleted += 1
    db.commit()
    return {"deleted": deleted, "skipped": skipped}


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, db: Session = Depends(get_db)):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    return db_category


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int, category: CategoryUpdate, db: Session = Depends(get_db)
):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in category.model_dump(exclude_unset=True).items():
        setattr(db_category, key, value)
    db.commit()
    db.refresh(db_category)
    return db_category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(db_category)
    db.commit()
