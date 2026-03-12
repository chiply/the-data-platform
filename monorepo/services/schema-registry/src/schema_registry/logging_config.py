"""Re-export logging configuration from top-level module.

The actual logging_config.py lives at the service root (next to entrypoint.sh)
so it can be configured before the application starts. This module provides a
convenient import path within the package.
"""


def configure_logging() -> None:
    """Configure structured logging."""
    import sys
    sys.path.insert(0, ".")
    from logging_config import configure_logging as _configure
    _configure()
