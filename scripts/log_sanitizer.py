import hashlib
import json
import logging
import re
from typing import Any

_CONFIGURED = False

_NOISY_LOGGERS = (
    "urllib3",
    "requests",
    "httpx",
    "httpcore",
    "sentence_transformers",
    "transformers",
    "accelerate",
    "huggingface_hub",
    "filelock",
)

_SENSITIVE_KEY_RE = re.compile(
    r'(?P<prefix>"?(?:prompt|response|text|context|highlight|content|ai_insight|query)"?\s*[:=]\s*)'
    r'(?P<value>"[^"]*"|\'[^\']*\'|[^,\]\}\n\r]+)',
    re.IGNORECASE,
)
_LABEL_PATTERNS = (
    (re.compile(r"(User prompt:\s*).+", re.IGNORECASE), r"\1[redacted]"),
    (re.compile(r"(User's Highlight:\s*\").*?(\")", re.IGNORECASE), r'\1[redacted]\2'),
    (re.compile(r"(Retrieved Texts:\s*).+", re.IGNORECASE | re.DOTALL), r"\1[redacted]"),
)


def summarize_text_for_log(label: str, text: Any) -> str:
    value = str(text or "").strip()
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:8] if value else "empty"
    return f"{label}_chars={len(value)} {label}_sha={digest}"


def sanitize_log_message(message: Any) -> str:
    sanitized = _SENSITIVE_KEY_RE.sub(r'\g<prefix>"[redacted]"', str(message))
    for pattern, replacement in _LABEL_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def safe_error_detail(detail: Any) -> str:
    if detail is None:
        return "details unavailable"
    if isinstance(detail, dict):
        compact = {
            key: value
            for key, value in detail.items()
            if key in {"error", "message", "code", "status", "type"}
        }
        if compact:
            return sanitize_log_message(json.dumps(compact, ensure_ascii=True))[:180]
        return "details redacted"
    if isinstance(detail, list):
        return "details redacted"
    sanitized = sanitize_log_message(detail).strip()
    return sanitized[:180] if sanitized else "details unavailable"


class SensitiveLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            rendered = record.getMessage()
        except Exception:
            rendered = str(record.msg)
        record.msg = sanitize_log_message(rendered)
        record.args = ()
        return True


def configure_runtime_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    root_logger = logging.getLogger()
    log_filter = SensitiveLogFilter()

    for handler in root_logger.handlers:
        handler.addFilter(log_filter)

    if not root_logger.handlers:
        root_logger.addFilter(log_filter)

    for logger_name in _NOISY_LOGGERS:
        logging.getLogger(logger_name).setLevel(logging.WARNING)

    _CONFIGURED = True
