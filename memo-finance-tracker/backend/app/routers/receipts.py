"""Receipt upload + OCR endpoint."""
import asyncio
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services.ai import ai_service
from app.services.ocr import parse_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])

# Storage directory – configurable via env var
RECEIPTS_DIR = Path(os.getenv("RECEIPTS_DIR", "data/receipts"))

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_SIZE_MB = 10


@router.post("/scan")
async def scan_receipt(file: UploadFile = File(...)):
    """Upload a receipt image, run OCR, return extracted fields as suggestions."""
    # Some browsers/OS report no content-type — fall back gracefully
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {MAX_SIZE_MB}MB)")

    result = await parse_receipt(image_bytes)

    # AI cleanup fallback: only when OCR succeeded but the regex heuristics left
    # gaps and the local model is ready. Fills missing fields without overriding
    # confident regex matches. Skipped entirely when AI is disabled/unavailable.
    result.setdefault("used_ai", False)
    if result.get("ocr_available") and ai_service.ready and result.get("raw_text"):
        low_confidence = not (
            result.get("amount_found")
            and result.get("date_found")
            and result.get("recipient_found")
        )
        if low_confidence:
            ai_fields = await asyncio.to_thread(
                ai_service.extract_receipt_fields, result["raw_text"]
            )
            if result.get("amount") is None and ai_fields.get("amount") is not None:
                result["amount"] = ai_fields["amount"]
                result["amount_found"] = True
                result["used_ai"] = True
            if not result.get("date") and ai_fields.get("date"):
                result["date"] = ai_fields["date"]
                result["date_found"] = True
                result["used_ai"] = True
            if not result.get("merchant") and ai_fields.get("recipient"):
                result["merchant"] = ai_fields["recipient"]
                result["recipient_found"] = True
                result["used_ai"] = True

    return result


@router.post("/upload")
async def upload_receipt(file: UploadFile = File(...)):
    """Save a receipt file and return its stored path."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    now = datetime.now()
    folder = RECEIPTS_DIR / str(now.year) / f"{now.month:02d}"
    folder.mkdir(parents=True, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "jpg"
    filename = f"txn_{now.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}.{ext}"
    dest = folder / filename

    content = await file.read()
    dest.write_bytes(content)

    return {"path": str(dest.relative_to(RECEIPTS_DIR.parent)), "filename": filename}


@router.get("/file/{year}/{month}/{filename}")
async def get_receipt_file(year: str, month: str, filename: str):
    """Serve a stored receipt file."""
    path = RECEIPTS_DIR / year / month / filename
    if not path.exists():
        raise HTTPException(404, "Receipt not found")
    return FileResponse(str(path))
