"""
Structured logging configuration for The Kage Protocol.

Provides JSON-formatted logging for production and human-readable
format for development. Each module should obtain a named logger
via ``get_logger(__name__)``.
"""

import logging
import json
import sys
from datetime import datetime, timezone
from typing import Any


class _JsonFormatter(logging.Formatter):
    """Produces one JSON object per log line for structured log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "extra_data"):
            entry["data"] = record.extra_data
        return json.dumps(entry)


class _DevFormatter(logging.Formatter):
    """Human-readable coloured output for local development."""

    COLORS = {
        "DEBUG": "\033[90m",
        "INFO": "\033[36m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[1;31m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        ts = datetime.now().strftime("%H:%M:%S")
        return f"{color}[{ts}] {record.levelname:<8}{self.RESET} {record.name} — {record.getMessage()}"


def setup_logging(level: str = "INFO", json_logs: bool = False) -> None:
    """
    Initialise the root logger for the application.

    Args:
        level: Python log level name (DEBUG, INFO, WARNING, ERROR).
        json_logs: When ``True`` use JSON formatter; otherwise use the
            coloured developer format.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove any pre-existing handlers (e.g. from uvicorn defaults)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter() if json_logs else _DevFormatter())
    root.addHandler(handler)

    # Quieten noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("docker").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger scoped to the given module."""
    return logging.getLogger(name)
