"""OCR service – extracts transaction fields from receipt images using Tesseract."""
import asyncio
import io
import re
import shutil
from datetime import date
from typing import Optional

try:
    from PIL import Image, ImageEnhance, ImageFilter
    import pytesseract
    # Verify the Tesseract binary is actually on PATH – not just the Python package
    _TESSERACT_BIN = shutil.which("tesseract")
    if _TESSERACT_BIN is None:
        # Try common Windows install location
        import os
        _WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(_WIN_PATH):
            pytesseract.pytesseract.tesseract_cmd = _WIN_PATH
            _TESSERACT_BIN = _WIN_PATH
    OCR_AVAILABLE = _TESSERACT_BIN is not None
except ImportError:
    OCR_AVAILABLE = False

# Keyword → category name mapping for auto-detect
MERCHANT_CATEGORY_MAP = {
    "migros": "Food & Drinks", "coop": "Food & Drinks", "aldi": "Food & Drinks",
    "lidl": "Food & Drinks", "rewe": "Food & Drinks", "denner": "Food & Drinks",
    "spar": "Food & Drinks", "manor": "Shopping", "ikea": "Shopping",
    "shell": "Transport", "esso": "Transport", "bp ": "Transport",
    "tanken": "Transport", "parking": "Transport",
    "apotheke": "Health", "pharmacy": "Health", "dr.": "Health",
    "netflix": "Entertainment", "spotify": "Entertainment", "steam": "Entertainment",
    "swisscom": "Other", "sunrise": "Other", "salt": "Other",
    "migrolino": "Food & Drinks", "mcdonald": "Food & Drinks", "starbucks": "Food & Drinks",
}


def preprocess_image(image_bytes: bytes) -> "Image.Image":
    """Preprocess image for better OCR quality."""
    img = Image.open(io.BytesIO(image_bytes)).convert("L")  # grayscale
    # Enhance contrast
    img = ImageEnhance.Contrast(img).enhance(2.0)
    # Sharpen
    img = img.filter(ImageFilter.SHARPEN)
    # Resize if too small (Tesseract works best at ~300dpi equivalent)
    w, h = img.size
    if w < 800:
        scale = 800 / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img


def extract_amount(text: str) -> Optional[float]:
    """Find the largest monetary amount in OCR text."""
    # Match: CHF 47.30, Total 12,50, 1'234.56, etc.
    patterns = [
        r"(?:CHF|EUR|USD|Fr\.?)\s*(\d{1,4}[.,\']\d{2})",
        r"(?:total|gesamt|betrag|zahlung|summe)[:\s]+(\d{1,4}[.,\']\d{2})",
        r"\b(\d{1,4}[.,]\d{2})\b",
    ]
    amounts = []
    for pattern in patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            raw = m.group(1).replace("'", "").replace(",", ".")
            try:
                amounts.append(float(raw))
            except ValueError:
                pass
    return max(amounts) if amounts else None


def extract_date(text: str) -> Optional[date]:
    """Extract date from OCR text, trying common formats."""
    patterns = [
        (r"(\d{2})\.(\d{2})\.(\d{4})", lambda m: date(int(m.group(3)), int(m.group(2)), int(m.group(1)))),
        (r"(\d{4})-(\d{2})-(\d{2})", lambda m: date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
        (r"(\d{2})/(\d{2})/(\d{2,4})", lambda m: date(2000 + int(m.group(3)) if len(m.group(3)) == 2 else int(m.group(3)), int(m.group(2)), int(m.group(1)))),
    ]
    for pattern, parser in patterns:
        m = re.search(pattern, text)
        if m:
            try:
                return parser(m)
            except (ValueError, AttributeError):
                pass
    return None


def extract_merchant(text: str) -> Optional[str]:
    """Use the first non-empty line as merchant name."""
    for line in text.splitlines():
        line = line.strip()
        if len(line) >= 3 and not re.match(r"^\d", line):
            return line[:60]
    return None


def guess_category(merchant: str) -> Optional[str]:
    """Guess category name from merchant name via keyword matching."""
    if not merchant:
        return None
    lower = merchant.lower()
    for keyword, category in MERCHANT_CATEGORY_MAP.items():
        if keyword in lower:
            return category
    return None


def _get_ocr_lang() -> str:
    """Return best available Tesseract language string."""
    try:
        langs = pytesseract.get_languages(config="")
        has_deu = "deu" in langs
        has_eng = "eng" in langs
        if has_deu and has_eng:
            return "deu+eng"
        if has_deu:
            return "deu"
        return "eng"
    except Exception:
        return "eng"


def _parse_receipt_sync(image_bytes: bytes) -> dict:
    """Synchronous OCR – call via run_in_executor to avoid blocking the event loop."""
    if not OCR_AVAILABLE:
        return {
            "ocr_available": False,
            "amount": None,
            "date": None,
            "merchant": None,
            "category_name": None,
            "raw_text": "",
        }

    try:
        img = preprocess_image(image_bytes)
        lang = _get_ocr_lang()
        raw_text = pytesseract.image_to_string(img, lang=lang)
    except Exception as e:
        return {
            "ocr_available": False,
            "error": str(e),
            "amount": None,
            "date": None,
            "merchant": None,
            "category_name": None,
            "raw_text": "",
        }

    merchant = extract_merchant(raw_text)
    return {
        "ocr_available": True,
        "amount": extract_amount(raw_text),
        "date": extract_date(raw_text).isoformat() if extract_date(raw_text) else None,
        "merchant": merchant,
        "category_name": guess_category(merchant),
        "raw_text": raw_text[:500],
    }


async def parse_receipt(image_bytes: bytes) -> dict:
    """Async wrapper – runs OCR in a thread pool to keep the event loop free."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _parse_receipt_sync, image_bytes)
