from __future__ import annotations

import logging
import os
import tempfile
from logging.handlers import RotatingFileHandler
from pathlib import Path


LOGGER_NAME = "earphone_project_builder"


def runtime_log_path() -> Path:
    platform_root = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(platform_root) / "EarphoneProjectBuilder" / "logs" / "builder.log"


def configure_runtime_logging(path: str | Path | None = None) -> Path:
    destination = Path(path) if path else runtime_log_path()
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        destination = Path(tempfile.gettempdir()) / "EarphoneProjectBuilder" / "logs" / "builder.log"
        destination.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(logging.INFO)
    resolved = destination.resolve()
    if not any(
        isinstance(handler, RotatingFileHandler) and Path(handler.baseFilename).resolve() == resolved
        for handler in logger.handlers
    ):
        handler = RotatingFileHandler(destination, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(threadName)s %(message)s"))
        logger.addHandler(handler)
    return destination


def get_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)
