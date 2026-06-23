"""Application version resolution.

Single source of truth for the version + build date shown in the UI and the
`/api/v1/version` endpoint. Resolution order (fully offline / local-first):

1. Environment variables ``APP_VERSION`` / ``APP_BUILD_DATE`` — baked into the
   container image at build time from the add-on ``config.yaml`` version (the
   Supervisor passes it as ``BUILD_VERSION``) and the release date.
2. A bundled ``version.json`` next to this module — written by the release
   workflow so source checkouts / non-add-on runs still report a real version.
3. ``"dev"`` / ``"unknown"`` fallback for local development.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

_VERSION_FILE = Path(__file__).resolve().parent / "version.json"


class VersionInfo(TypedDict):
    version: str
    build_date: str


@lru_cache(maxsize=1)
def get_version() -> VersionInfo:
    """Return the resolved application version and build date."""
    version = os.getenv("APP_VERSION", "").strip()
    build_date = os.getenv("APP_BUILD_DATE", "").strip()

    if not version or version == "dev":
        file_data = _read_version_file()
        version = version or file_data.get("version", "")
        build_date = build_date or file_data.get("build_date", "")

    return VersionInfo(
        version=version or "dev",
        build_date=build_date or "unknown",
    )


def _read_version_file() -> dict:
    try:
        with _VERSION_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        pass
    return {}
