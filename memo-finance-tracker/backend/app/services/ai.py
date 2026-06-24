"""Embedded local AI service (llama.cpp + Qwen2.5-VL-3B-Instruct, GGUF Q4_K_M).

Everything runs inside the MEMO container — no Ollama, no external API. The model
is a small **vision** language model: it reads receipt photos directly (real
on-device OCR) and also powers auto-categorization and the monthly insight. The
model + its vision projector (mmproj) are downloaded once on first enable into
the persistent ``/data/models`` volume and loaded lazily in a background thread
so they never block app startup or the health check. If AI is disabled, the
download fails, or the model cannot be loaded (e.g. too little RAM), every
feature degrades gracefully and the rest of the app keeps working (receipt
scanning falls back to the lightweight Tesseract OCR).

The only network access is the one-time model download; all inference is local.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import threading
import urllib.request
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("memo.ai")

# Qwen2.5-VL-3B-Instruct (GGUF) — a vision model that does OCR *and* text tasks.
# Q4_K_M keeps the footprint lean (~1.9 GB) and the Q8_0 mmproj (~850 MB) is the
# vision encoder. Both live in the same ggml-org repository.
MODEL_URL = (
    "https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/"
    "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf"
)
MODEL_FILENAME = "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf"
MMPROJ_URL = (
    "https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/"
    "mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf"
)
MMPROJ_FILENAME = "mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf"
MODEL_DIR = Path(os.getenv("AI_MODEL_DIR", "/data/models"))

# Text-only models shipped before the vision upgrade; removed to reclaim space.
LEGACY_MODEL_FILENAMES = ("qwen2.5-0.5b-instruct-q4_k_m.gguf",)

# Inference tuning (overridable via env). Defaults are deliberately conservative
# for the weak CPUs typical of a Home Assistant host / Proxmox VM.
N_CTX = int(os.getenv("AI_N_CTX", "4096"))
N_THREADS = int(os.getenv("AI_N_THREADS", "2"))
# Downscale receipt photos before vision inference: a smaller image means far
# fewer vision tokens (much faster on CPU) while keeping receipt text legible.
MAX_IMAGE_EDGE = int(os.getenv("AI_MAX_IMAGE_EDGE", "1024"))

# Runtime on/off override toggled from the Settings page. Persisted to the
# add-on /data volume so the choice survives restarts. When the file is absent
# the AI_ENABLED env var (add-on configuration) is used as the default.
OVERRIDE_FILE = Path(os.getenv("AI_STATE_FILE", str(MODEL_DIR.parent / "ai_enabled.flag")))

# Lifecycle states surfaced via /api/v1/ai/status
STATE_DISABLED = "disabled"
STATE_DOWNLOADING = "downloading"
STATE_LOADING = "loading"
STATE_READY = "ready"
STATE_ERROR = "error"

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def _ai_enabled_default() -> bool:
    """Default AI on/off from the add-on configuration (AI_ENABLED env var).

    Ships **off** by default: the vision model is a sizeable download and is slow
    on weak hardware, so the user must opt in (add-on config or Settings page).
    """
    return os.getenv("AI_ENABLED", "false").strip().lower() in _TRUE_VALUES


def _read_override() -> Optional[bool]:
    """Persisted Settings-page override, or None when not set."""
    try:
        if OVERRIDE_FILE.exists():
            value = OVERRIDE_FILE.read_text(encoding="utf-8").strip().lower()
            if value in _TRUE_VALUES:
                return True
            if value in _FALSE_VALUES:
                return False
    except Exception:  # pragma: no cover - never let a bad file break startup
        pass
    return None


class AIService:
    """Singleton wrapper around a lazily-loaded llama.cpp model."""

    def __init__(self) -> None:
        self._llm = None
        self._enabled_override = _read_override()
        self._state = STATE_DISABLED if not self._is_enabled() else STATE_LOADING
        self._detail = ""
        self._lock = threading.Lock()  # llama.cpp is not thread-safe
        self._init_started = False
        self._model_path = MODEL_DIR / MODEL_FILENAME
        self._mmproj_path = MODEL_DIR / MMPROJ_FILENAME
        self._progress = 0  # 0-100 overall model-download progress (for the UI)
        self._download_total = 0  # total bytes to fetch in the current download
        self._downloaded_bytes = 0  # bytes fetched so far in the current download

    # ── Lifecycle ────────────────────────────────────────────────────────────

    def _is_enabled(self) -> bool:
        """Effective on/off: Settings override wins over the env-var default."""
        if self._enabled_override is not None:
            return self._enabled_override
        return _ai_enabled_default()

    def _persist_override(self, enabled: bool) -> None:
        try:
            OVERRIDE_FILE.parent.mkdir(parents=True, exist_ok=True)
            OVERRIDE_FILE.write_text("true" if enabled else "false", encoding="utf-8")
        except Exception as exc:  # pragma: no cover - persistence is best-effort
            logger.warning("[MEMO AI] Could not persist AI on/off choice: %s", exc)

    def set_enabled(self, enabled: bool) -> dict:
        """Turn the local AI on or off at runtime (from the Settings page)."""
        self._enabled_override = enabled
        self._persist_override(enabled)
        if enabled:
            # Allow (re)initialisation even if it was previously disabled/errored.
            if self._state in (STATE_DISABLED, STATE_ERROR):
                self._init_started = False
                self._state = STATE_LOADING
                self._detail = "Enabling…"
            self.start_background_init()
            logger.info("[MEMO AI] Enabled via settings.")
        else:
            with self._lock:
                self._llm = None
            self._state = STATE_DISABLED
            self._detail = "AI disabled via settings"
            self._init_started = False
            logger.info("[MEMO AI] Disabled via settings.")
        return self.status()

    def start_background_init(self) -> None:
        """Kick off model download + load in a daemon thread (idempotent)."""
        if self._init_started:
            return
        self._init_started = True
        if not self._is_enabled():
            self._state = STATE_DISABLED
            self._detail = "AI disabled via add-on configuration"
            logger.info("[MEMO AI] Disabled via configuration — skipping model load.")
            return
        thread = threading.Thread(target=self._initialize, name="memo-ai-init", daemon=True)
        thread.start()

    def _initialize(self) -> None:
        try:
            self._ensure_model_downloaded()
            self._load_model()
        except Exception as exc:  # pragma: no cover - defensive, keep app alive
            self._state = STATE_ERROR
            self._detail = str(exc)
            logger.warning("[MEMO AI] Initialization failed: %s", exc)

    def _cleanup_legacy_models(self) -> None:
        """Best-effort removal of superseded model files to reclaim disk space."""
        for name in LEGACY_MODEL_FILENAMES:
            try:
                (MODEL_DIR / name).unlink(missing_ok=True)
            except Exception:  # pragma: no cover - cleanup is best-effort
                pass

    def _ensure_model_downloaded(self) -> None:
        self._cleanup_legacy_models()
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        targets = (
            (MODEL_URL, self._model_path, "model (~1.9 GB)", 2_000_000_000),
            (MMPROJ_URL, self._mmproj_path, "vision encoder (~850 MB)", 850_000_000),
        )
        pending = [
            (url, dest, label, approx)
            for url, dest, label, approx in targets
            if not (dest.exists() and dest.stat().st_size > 0)
        ]
        if not pending:
            self._progress = 100
            return
        # Establish the overall size up front so the UI can show a real progress
        # bar that spans both files (model + vision encoder). HEAD may fail on
        # some networks, so fall back to the approximate sizes.
        self._download_total = sum(
            (self._remote_size(url) or approx) for url, dest, label, approx in pending
        )
        self._downloaded_bytes = 0
        self._progress = 0
        for url, dest, label, approx in pending:
            self._state = STATE_DOWNLOADING
            self._detail = f"Downloading {label}"
            logger.info("[MEMO AI] Downloading %s, this may take a while...", label)
            tmp_path = dest.with_suffix(dest.suffix + ".part")
            try:
                self._download(url, tmp_path)
                tmp_path.replace(dest)  # atomic on the same filesystem
                logger.info("[MEMO AI] Download complete: %s", label)
            except Exception:
                tmp_path.unlink(missing_ok=True)
                raise
        self._progress = 100

    @staticmethod
    def _remote_size(url: str) -> Optional[int]:
        """Best-effort remote file size (Content-Length) for the progress total."""
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "MEMO-Finance-Tracker"}, method="HEAD"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
                size = int(resp.headers.get("Content-Length", 0))
                return size or None
        except Exception:  # pragma: no cover - size probe is best-effort
            return None

    def _download(self, url: str, dest: Path) -> None:
        req = urllib.request.Request(url, headers={"User-Agent": "MEMO-Finance-Tracker"})
        with urllib.request.urlopen(req) as resp, dest.open("wb") as out:  # noqa: S310
            next_log = 10
            chunk = resp.read(1 << 20)
            while chunk:
                out.write(chunk)
                self._downloaded_bytes += len(chunk)
                if self._download_total > 0:
                    # Cap at 99% until the file is fully on disk; 100% is set by
                    # the caller once every file has been downloaded.
                    self._progress = min(
                        99, int(self._downloaded_bytes * 100 / self._download_total)
                    )
                    if self._progress >= next_log:
                        logger.info("[MEMO AI] Download progress: %d%%", self._progress)
                        next_log += 10
                chunk = resp.read(1 << 20)

    def _load_model(self) -> None:
        self._state = STATE_LOADING
        self._detail = "Loading model"
        try:
            from llama_cpp import Llama
            from llama_cpp.llama_chat_format import Qwen25VLChatHandler
        except Exception as exc:  # noqa: BLE001 - import can fail with RuntimeError
            # (e.g. NumPy CPU-baseline mismatch or a too-old llama-cpp-python
            # without the vision handler), not only ImportError. Any failure here
            # is caught by _initialize() and just disables AI (Tesseract remains).
            raise RuntimeError(f"llama-cpp-python vision unavailable: {exc}") from exc

        # The chat handler wires up the vision projector (mmproj) so the model can
        # actually see images passed as `image_url` content.
        chat_handler = Qwen25VLChatHandler(
            clip_model_path=str(self._mmproj_path), verbose=False
        )
        self._llm = Llama(
            model_path=str(self._model_path),
            chat_handler=chat_handler,
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            verbose=False,
        )
        self._state = STATE_READY
        self._detail = "Model loaded"
        logger.info("[MEMO AI] Vision model loaded and ready.")

    # ── Introspection ────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._state == STATE_READY and self._llm is not None

    def status(self) -> dict:
        return {
            "enabled": self._is_enabled(),
            "state": self._state,
            "ready": self.ready,
            "detail": self._detail,
            "model": MODEL_FILENAME,
            "progress": self._progress,
        }

    # ── Inference helpers ────────────────────────────────────────────────────

    def _chat(self, system: str, user: str, max_tokens: int = 96, temperature: float = 0.1) -> str:
        if not self.ready:
            return ""
        with self._lock:
            try:
                result = self._llm.create_chat_completion(
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                return (result["choices"][0]["message"]["content"] or "").strip()
            except Exception as exc:  # pragma: no cover - keep callers safe
                logger.warning("[MEMO AI] Inference failed: %s", exc)
                return ""

    @staticmethod
    def _image_to_data_uri(image_bytes: bytes) -> str:
        """Downscale (for speed) and base64-encode an image as a data URI."""
        data = image_bytes
        try:
            import io

            from PIL import Image

            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            long_edge = max(img.size)
            if long_edge > MAX_IMAGE_EDGE:
                scale = MAX_IMAGE_EDGE / float(long_edge)
                img = img.resize(
                    (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale))),
                    Image.LANCZOS,
                )
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            data = buf.getvalue()
        except Exception:  # pragma: no cover - fall back to the raw bytes
            data = image_bytes
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"

    def _chat_vision(
        self,
        system: str,
        image_bytes: bytes,
        user_text: str,
        max_tokens: int = 160,
        temperature: float = 0.0,
    ) -> str:
        """Run a single image + text prompt through the vision model."""
        if not self.ready:
            return ""
        data_uri = self._image_to_data_uri(image_bytes)
        with self._lock:
            try:
                result = self._llm.create_chat_completion(
                    messages=[
                        {"role": "system", "content": system},
                        {
                            "role": "user",
                            "content": [
                                {"type": "image_url", "image_url": {"url": data_uri}},
                                {"type": "text", "text": user_text},
                            ],
                        },
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                return (result["choices"][0]["message"]["content"] or "").strip()
            except Exception as exc:  # pragma: no cover - keep callers safe
                logger.warning("[MEMO AI] Vision inference failed: %s", exc)
                return ""

    def extract_receipt_from_image(self, image_bytes: bytes) -> dict:
        """Read a receipt photo directly with the vision model.

        Returns ``{amount, date, recipient}`` (values may be None). This sees the
        actual image, so it is far more reliable than cleaning up noisy OCR text.
        """
        empty = {"amount": None, "date": None, "recipient": None}
        if not self.ready or not image_bytes:
            return empty
        system = (
            "You read receipt and invoice photos and extract structured data. "
            "Respond with ONLY a compact JSON object with keys amount (number — the "
            "grand total actually paid), date (YYYY-MM-DD) and recipient (the store "
            "or merchant name). Use null for any value that is not clearly visible."
        )
        user_text = (
            "Extract the total amount, the date and the merchant from this receipt "
            "and return only the JSON object."
        )
        raw = self._chat_vision(
            system, image_bytes, user_text, max_tokens=128, temperature=0.0
        )
        return self._parse_fields_json(raw) or empty

    def categorize(self, description: str, categories: List[str]) -> Optional[str]:
        """Return the best-matching category name from ``categories`` or None."""
        if not self.ready or not categories or not description.strip():
            return None
        system = (
            "You are a strict expense classifier. Choose the single best category "
            "for the transaction from the provided list. Reply with only the exact "
            "category name, nothing else."
        )
        user = f"Transaction: {description}\nCategories: {', '.join(categories)}\nCategory:"
        raw = self._chat(system, user, max_tokens=24, temperature=0.0)
        return self._match_category(raw, categories)

    @staticmethod
    def _match_category(raw: str, categories: List[str]) -> Optional[str]:
        if not raw:
            return None
        cleaned = raw.strip().strip(".\"' ").splitlines()[0].strip()
        # Exact (case-insensitive) match first
        for cat in categories:
            if cat.lower() == cleaned.lower():
                return cat
        # Substring containment either way
        for cat in categories:
            if cat.lower() in cleaned.lower() or cleaned.lower() in cat.lower():
                return cat
        # Fuzzy fallback
        try:
            from rapidfuzz import process

            match = process.extractOne(cleaned, categories, score_cutoff=70)
            if match:
                return match[0]
        except Exception:
            pass
        return None

    def extract_receipt_fields(self, raw_text: str) -> dict:
        """LLM cleanup of OCR text → {amount, date, recipient}. Empty on failure."""
        empty = {"amount": None, "date": None, "recipient": None}
        if not self.ready or not raw_text.strip():
            return empty
        system = (
            "You extract structured data from noisy receipt OCR text. Respond with "
            "ONLY a compact JSON object with keys amount (number), date "
            "(YYYY-MM-DD), recipient (store name). Use null when unknown."
        )
        user = f"Receipt text:\n{raw_text[:1200]}\n\nJSON:"
        raw = self._chat(system, user, max_tokens=128, temperature=0.0)
        return self._parse_fields_json(raw) or empty

    @staticmethod
    def _parse_fields_json(raw: str) -> Optional[dict]:
        if not raw:
            return None
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except ValueError:
            return None
        amount = data.get("amount")
        try:
            amount = float(amount) if amount is not None else None
        except (TypeError, ValueError):
            amount = None
        date_val = data.get("date")
        if not (isinstance(date_val, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_val)):
            date_val = None
        recipient = data.get("recipient")
        recipient = recipient.strip()[:60] if isinstance(recipient, str) and recipient.strip() else None
        return {"amount": amount, "date": date_val, "recipient": recipient}

    def monthly_insight(self, summary: dict) -> Optional[str]:
        """Generate a short plain-language spending insight with one saving tip."""
        if not self.ready:
            return None
        income = summary.get("total_income", 0)
        expenses = summary.get("total_expenses", 0)
        currency = summary.get("currency", "")
        top = summary.get("top_categories", [])
        top_str = ", ".join(f"{t['name']} {t['amount']:.0f}" for t in top) or "n/a"
        system = (
            "You are a concise personal-finance assistant. Given a 30-day summary, "
            "reply with 2-3 short sentences in the user's language describing the "
            "spending and end with exactly one concrete saving tip. No markdown."
        )
        user = (
            f"Currency: {currency}\nIncome: {income:.0f}\nExpenses: {expenses:.0f}\n"
            f"Top categories: {top_str}"
        )
        text = self._chat(system, user, max_tokens=160, temperature=0.4)
        return text or None


# Module-level singleton
ai_service = AIService()
