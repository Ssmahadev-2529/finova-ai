"""
Finova AI - Pre-Startup Controlled Database Migration Runner
Executes schema creation and additive migrations once under database locking before
multi-worker application processes launch. Fails non-zero on any database error.
"""

import logging
import sys

from config import settings
from database import engine, initialize_database
from routes.transaction_routes import seed_initial_transactions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("finova.migrate")


def run_prestartup_migrations() -> int:
    """Runs controlled database initialization and additive migrations cleanly."""
    logger.info("Running pre-startup database migrations in %s mode...", settings.APP_ENV)
    seed_fn = None if settings.is_production else seed_initial_transactions
    try:
        initialize_database(target_engine=engine, seed_fn=seed_fn)
        logger.info("Pre-startup database initialization completed successfully.")
        return 0
    except Exception as exc:
        logger.error("Pre-startup database initialization failed (%s).", type(exc).__name__)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    sys.exit(run_prestartup_migrations())

