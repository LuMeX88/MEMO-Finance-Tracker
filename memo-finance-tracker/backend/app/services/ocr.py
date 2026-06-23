"""OCR service – extracts transaction fields from receipt images using Tesseract.

The preprocessing pipeline uses OpenCV when available (grayscale → upscale →
denoise → deskew → adaptive threshold) for markedly better recognition, and
falls back to a lightweight PIL pipeline in minimal environments. All processing
is 100% local; no external OCR services are contacted.
"""
import asyncio
import io
import logging
import os
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
        _WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(_WIN_PATH):
            pytesseract.pytesseract.tesseract_cmd = _WIN_PATH
            _TESSERACT_BIN = _WIN_PATH
    OCR_AVAILABLE = _TESSERACT_BIN is not None
except Exception as exc:  # noqa: BLE001 - importing pytesseract pulls in NumPy,
    # which can raise RuntimeError (not ImportError) on CPUs/VMs that lack the
    # CPU baseline its wheel was built for (e.g. "NumPy was built with baseline
    # optimizations (X86_V2) but your machine doesn't support (X86_V2)"). We must
    # never let that crash the whole app — OCR simply becomes unavailable.
    OCR_AVAILABLE = False
    logging.getLogger("memo.ocr").warning(
        "OCR disabled — could not import Tesseract/NumPy: %s", exc
    )

# OpenCV is optional. When present we use a far stronger preprocessing pipeline;
# otherwise we fall back to PIL so the service still works in minimal dev setups.
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except Exception:  # noqa: BLE001 - same NumPy/CPU-baseline caveat as above
    CV2_AVAILABLE = False

# Best OCR engine (--oem 3) + assume a single uniform block of text (--psm 6),
# which suits receipts well.
TESSERACT_CONFIG = "--oem 3 --psm 6"
MIN_LONG_EDGE = 1500

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


def _deskew_cv2(gray: "np.ndarray") -> "np.ndarray":
    """Straighten a slightly rotated image using the dominant text angle."""
    inverted = cv2.bitwise_not(gray)
    thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    coords = cv2.findNonZero(thresh)
    if coords is None:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    # OpenCV's angle range is version-dependent; normalize to (-45, 45].
    angle = ((angle + 45) % 90) - 45
    # Skip negligible skew and implausibly large corrections (likely misdetected).
    if abs(angle) < 0.5 or abs(angle) > 15:
        return gray
    h, w = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(
        gray, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def _preprocess_cv2(image_bytes: bytes) -> "np.ndarray":
    """Strong OpenCV preprocessing pipeline for receipt photos."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Upscale small images so Tesseract sees ~300dpi-equivalent glyphs.
    h, w = gray.shape[:2]
    long_edge = max(h, w)
    if long_edge < MIN_LONG_EDGE:
        scale = MIN_LONG_EDGE / float(long_edge)
        gray = cv2.resize(
            gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC
        )

    # Remove speckle noise while keeping edges crisp.
    gray = cv2.medianBlur(gray, 3)

    # Correct small rotations before thresholding.
    gray = _deskew_cv2(gray)

    # Adaptive (local) thresholding copes with uneven lighting far better than a
    # single global cutoff.
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )


def _preprocess_pil(image_bytes: bytes) -> "Image.Image":
    """Lightweight PIL fallback when OpenCV is unavailable."""
    img = Image.open(io.BytesIO(image_bytes)).convert("L")  # grayscale
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    w, h = img.size
    long_edge = max(w, h)
    if long_edge < MIN_LONG_EDGE:
        scale = MIN_LONG_EDGE / float(long_edge)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img


def preprocess_image(image_bytes: bytes):
    """Return a preprocessed image ready for Tesseract (numpy array or PIL image)."""
    if CV2_AVAILABLE:
        return _preprocess_cv2(image_bytes)
    return _preprocess_pil(image_bytes)


def extract_amount(text: str) -> Optional[float]:
    """Find the largest monetary amount in OCR text."""
    # Match: CHF 47.30, Total 12,50, 1'234.56, Summe 12.50, etc.
    patterns = [
        r"(?:CHF|EUR|USD|Fr\.?|€|\$)\s*(\d{1,4}[.,\']\d{2})",
        r"(?:total|gesamt|betrag|zahlung|summe|sum|amount)[:\s]+(\d{1,4}[.,\']\d{2})",
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
            "amount_found": False,
            "date_found": False,
            "recipient_found": False,
        }

    try:
        img = preprocess_image(image_bytes)
        lang = _get_ocr_lang()
        raw_text = pytesseract.image_to_string(img, lang=lang, config=TESSERACT_CONFIG)
    except Exception as e:
        return {
            "ocr_available": False,
            "error": str(e),
            "amount": None,
            "date": None,
            "merchant": None,
            "category_name": None,
            "raw_text": "",
            "amount_found": False,
            "date_found": False,
            "recipient_found": False,
        }

    amount = extract_amount(raw_text)
    parsed_date = extract_date(raw_text)
    merchant = extract_merchant(raw_text)

    return {
        "ocr_available": True,
        "amount": amount,
        "date": parsed_date.isoformat() if parsed_date else None,
        "merchant": merchant,
        "category_name": guess_category(merchant),
        "raw_text": raw_text[:2000],
        "amount_found": amount is not None,
        "date_found": parsed_date is not None,
        "recipient_found": bool(merchant),
    }


async def parse_receipt(image_bytes: bytes) -> dict:
    """Async wrapper – runs OCR in a thread pool to keep the event loop free."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _parse_receipt_sync, image_bytes)
