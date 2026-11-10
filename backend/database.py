import logging
import threading
from typing import Callable, Optional
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from config import settings

logger = logging.getLogger("finova.database")

PG_MIGRATION_ADVISORY_LOCK_ID = 749201843
REQUIRED_TABLES = (
    "users",
    "security_audit_logs",
    "webhook_events",
    "revoked_tokens",
    "paypal_orders",
    "transactions",
    "scam_audit_logs",
)
REQUIRED_COLUMNS = {
    "users": ("token_version",),
    "transactions": ("user_id",),
    "scam_audit_logs": ("user_id",),
}
_LOCAL_INIT_LOCK = threading.Lock()

# 1. Normalize connection URL (e.g. Supabase/Render postgres:// -> postgresql://)
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# 2. Configure engine parameters based on dialect
engine_kwargs = {
    "echo": (settings.APP_ENV == "development" and not db_url.startswith("postgresql"))
}

if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif db_url.startswith("postgresql"):
    # Enterprise connection pooling for Supabase / PostgreSQL with fail-fast connect timeout
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300
    engine_kwargs["connect_args"] = {"connect_timeout": 5}

engine = create_engine(db_url, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _apply_additive_migrations(conn) -> None:
    """Applies additive idempotent column migrations on an already-locked connection."""
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "transactions" in existing_tables:
        txn_columns = {col["name"] for col in inspector.get_columns("transactions")}
        if "user_id" not in txn_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN user_id VARCHAR(64)"))
            logger.info("Migrated transactions table: added nullable user_id column.")

    if "users" in existing_tables:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        if "token_version" not in user_columns:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
            )
            logger.info("Migrated users table: added token_version column (default 0).")

    if "scam_audit_logs" in existing_tables:
        scam_columns = {col["name"] for col in inspector.get_columns("scam_audit_logs")}
        if "user_id" not in scam_columns:
            conn.execute(text("ALTER TABLE scam_audit_logs ADD COLUMN user_id VARCHAR(64)"))
            logger.info("Migrated scam_audit_logs table: added nullable user_id column.")


def ensure_schema_migrations(target_engine=None) -> None:
    """
    Runs idempotent additive schema migrations for SQLite and PostgreSQL without altering existing records.
    Uses a transaction-scoped PostgreSQL advisory lock (pg_advisory_xact_lock) safe with PgBouncer transaction pooling,
    plus a process-level threading lock for SQLite concurrency.
    """
    eng = target_engine or engine
    is_postgres = eng.dialect.name == "postgresql"

    with _LOCAL_INIT_LOCK:
        try:
            with eng.connect() as conn:
                with conn.begin():
                    if is_postgres:
                        conn.execute(
                            text("SELECT pg_advisory_xact_lock(:lock_id)"),
                            {"lock_id": PG_MIGRATION_ADVISORY_LOCK_ID},
                        )
                    _apply_additive_migrations(conn)
        except Exception as exc:
            logger.error("Schema migration error (%s)", type(exc).__name__)
            raise


def initialize_database(
    target_engine=None,
    seed_fn: Optional[Callable] = None,
) -> None:
    """
    Controlled schema initialization & migration entry point.
    Creates missing tables and applies additive migrations under a single transaction lock,
    then optionally seeds development data.
    """
    import models.user  # noqa: F401
    import models.transaction  # noqa: F401

    eng = target_engine or engine
    is_postgres = eng.dialect.name == "postgresql"

    with _LOCAL_INIT_LOCK:
        with eng.connect() as conn:
            with conn.begin():
                if is_postgres:
                    conn.execute(
                        text("SELECT pg_advisory_xact_lock(:lock_id)"),
                        {"lock_id": PG_MIGRATION_ADVISORY_LOCK_ID},
                    )
                Base.metadata.create_all(bind=conn)
                _apply_additive_migrations(conn)

        if seed_fn is not None:
            session_factory = sessionmaker(autocommit=False, autoflush=False, bind=eng)
            db = session_factory()
            try:
                seed_fn(db)
            finally:
                db.close()


def verify_database_ready(target_engine=None) -> None:
    """
    Verifies database connectivity and confirms all required tables and migrated columns exist without mutating schema.
    Raises RuntimeError if unreachable or unmigrated.
    """
    eng = target_engine or engine
    with eng.connect() as conn:
        conn.execute(text("SELECT 1"))
        inspector = inspect(conn)
        existing = set(inspector.get_table_names())
        missing_tables = sorted(set(REQUIRED_TABLES) - existing)
        if missing_tables:
            raise RuntimeError(f"Database schema incomplete; missing required tables: {', '.join(missing_tables)}")
        for table_name, req_cols in REQUIRED_COLUMNS.items():
            present_cols = {col["name"] for col in inspector.get_columns(table_name)}
            missing_cols = [col for col in req_cols if col not in present_cols]
            if missing_cols:
                raise RuntimeError(
                    f"Database schema unmigrated on table '{table_name}'; missing columns: {', '.join(missing_cols)}"
                )
