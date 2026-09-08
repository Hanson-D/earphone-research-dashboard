from __future__ import annotations

import logging
import os
import faulthandler
import sys
import tempfile
from logging.handlers import RotatingFileHandler
from pathlib import Path


LOGGER_NAME = "earphone_project_builder"
_FAULT_STREAM = None
_LOG_PATH: Path | None = None


def runtime_log_path() -> Path:
    platform_root = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(platform_root) / "EarphoneProjectBuilder" / "logs" / "builder.log"


def configure_runtime_logging(path: str | Path | None = None) -> Path:
    global _LOG_PATH
    destination = Path(path) if path else runtime_log_path()
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(logging.INFO)
    fallback = Path(tempfile.gettempdir()) / "EarphoneProjectBuilder" / "logs" / "builder.log"
    for candidate in (destination, fallback):
        try:
            candidate.parent.mkdir(parents=True, exist_ok=True)
            resolved = candidate.resolve()
            if not any(
                isinstance(handler, RotatingFileHandler) and Path(handler.baseFilename).resolve() == resolved
                for handler in logger.handlers
            ):
                handler = RotatingFileHandler(candidate, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
                handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(threadName)s %(message)s"))
                logger.addHandler(handler)
            destination = candidate
            break
        except OSError:
            if candidate == fallback:
                raise
    _LOG_PATH = destination
    return destination


def get_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)


def install_exception_logging() -> None:
    logger = get_logger()

    def log_unhandled(error_type, error, traceback) -> None:
        logger.critical("unhandled application exception", exc_info=(error_type, error, traceback))

    sys.excepthook = log_unhandled


def arm_hang_trace(timeout: int = 45) -> Path | None:
    """Write all Python thread stacks if a UI rendering step stops returning."""
    global _FAULT_STREAM
    cancel_hang_trace()
    destination = (_LOG_PATH or runtime_log_path()).with_name("builder-hang.log")
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        _FAULT_STREAM = destination.open("a", encoding="utf-8", buffering=1)
        _FAULT_STREAM.write("\n--- hang watchdog armed ---\n")
        faulthandler.dump_traceback_later(timeout, repeat=False, file=_FAULT_STREAM)
        return destination
    except (OSError, RuntimeError):
        get_logger().exception("could not arm hang traceback")
        if _FAULT_STREAM:
            _FAULT_STREAM.close()
            _FAULT_STREAM = None
        return None


def cancel_hang_trace() -> None:
    global _FAULT_STREAM
    try:
        faulthandler.cancel_dump_traceback_later()
    except RuntimeError:
        pass
    if _FAULT_STREAM:
        _FAULT_STREAM.close()
        _FAULT_STREAM = None
