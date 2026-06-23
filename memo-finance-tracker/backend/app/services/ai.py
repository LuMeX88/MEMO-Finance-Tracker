"""Embedded local AI service (llama.cpp + Qwen2.5-0.5B-Instruct, GGUF Q4_K_M).

Everything runs inside the MEMO container — no Ollama, no external API. The model
is downloaded once on first start into the persistent ``/data/models`` volume and
loaded lazily in a background thread so it never blocks app startup or the health
check. If AI is disabled, the model fails to download, or it cannot be loaded
(e.g. too little RAM), every feature degrades gracefully and the rest of the app
keeps working.

The only network access is the one-time model download; all inference is local.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import urllib.request
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("memo.ai")

MODEL_URL = (
    "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/"
    "qwen2.5-0.5b-instruct-q4_k_m.gguf"
)
MODEL_FILENAME = "qwen2.5-0.5b-instruct-q4_k_m.gguf"
MODEL_DIR = Path(os.getenv("AI_MODEL_DIR", "/data/models"))

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
    """Default AI on/off from the add-on configuration (AI_ENABLED env var)."""
    return os.getenv("AI_ENABLED", "true").strip().lower() in _TRUE_VALUES


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

    def _ensure_model_downloaded(self) -> None:
        if self._model_path.exists() and self._model_path.stat().st_size > 0:
            return
        self._state = STATE_DOWNLOADING
        self._detail = "Downloading model (~400 MB)"
        logger.info("[MEMO AI] Downloading model (~400 MB), this may take a moment...")
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = self._model_path.with_suffix(self._model_path.suffix + ".part")
        try:
            self._download(MODEL_URL, tmp_path)
            tmp_path.replace(self._model_path)  # atomic on the same filesystem
            logger.info("[MEMO AI] Model download complete.")
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

    @staticmethod
    def _download(url: str, dest: Path) -> None:
        req = urllib.request.Request(url, headers={"User-Agent": "MEMO-Finance-Tracker"})
        with urllib.request.urlopen(req) as resp, dest.open("wb") as out:  # noqa: S310
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            next_log = 10
            chunk = resp.read(1 << 20)
            while chunk:
                out.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    if pct >= next_log:
                        logger.info("[MEMO AI] Download progress: %d%%", pct)
                        next_log += 10
                chunk = resp.read(1 << 20)

    def _load_model(self) -> None:
        self._state = STATE_LOADING
        self._detail = "Loading model"
        try:
            from llama_cpp import Llama
        except Exception as exc:  # noqa: BLE001 - import can fail with RuntimeError
            # (e.g. NumPy CPU-baseline mismatch), not only ImportError. Any failure
            # here is caught by _initialize() and just disables AI.
            raise RuntimeError(f"llama-cpp-python unavailable: {exc}") from exc

        self._llm = Llama(
            model_path=str(self._model_path),
            n_ctx=512,
            n_threads=2,
            verbose=False,
        )
        self._state = STATE_READY
        self._detail = "Model loaded"
        logger.info("[MEMO AI] Model loaded and ready.")

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
