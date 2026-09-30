"""
QSentinel — database bootstrap.

    export DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME"
    pip install "sqlalchemy>=2.0" "psycopg[binary]>=3.1"
    python db.py            # creates all tables, seeds attack_catalog, prints a summary

`init_db()` is idempotent and is called once at API start-up.
Use Alembic later if the schema must evolve; `create_all` never alters existing tables.
"""
from __future__ import annotations

import os
import secrets
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, inspect, text, update
from sqlalchemy.orm import Session, sessionmaker

from models import Base, LedgerLookup, Run, SessionLedger
from seed_catalog import upsert_catalog

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set (postgresql+psycopg://user:pass@host:5432/dbname)")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)

# Session key alphabet — same 33 characters the frontend mock uses (no i, l, o, u).
_ALPHABET = "0123456789abcdefghjkmnpqrstuvwxyz"


@contextmanager
def transaction() -> Iterator[Session]:
    """One transaction per run: commit on success, roll back on any exception."""
    with SessionLocal.begin() as s:
        yield s


def init_db() -> None:
    Base.metadata.create_all(engine)
    with transaction() as s:
        upsert_catalog(s)


# ---------------------------------------------------------------- session keys
def new_session_key(s: Session, length: int = 8, attempts: int = 8) -> str:
    """Cryptographically random, unique, single-use session key (CSPRNG + DB uniqueness check)."""
    for _ in range(attempts):
        key = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if s.get(Run, key) is None:
            return key
    raise RuntimeError("could not allocate a unique session key")


def unissued_key(s: Session, length: int = 8) -> str:
    """A well-formed key that the ledger has never issued (replay / 'unknown' scenario)."""
    while True:
        key = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if s.get(SessionLedger, key) is None and s.get(Run, key) is None:
            return key


# ---------------------------------------------------------------- ledger
def admit_session(s: Session, session_id: str) -> None:
    """Stage 1 passed: the key becomes ACTIVE."""
    s.add(SessionLedger(session_id=session_id, status="ACTIVE"))
    s.flush()


def refuse_session(s: Session, session_id: str) -> None:
    """Stage 1 failed (impersonation): keep an audit row, never ACTIVE."""
    s.add(SessionLedger(session_id=session_id, status="REFUSED"))
    s.flush()


def ledger_lookup_and_consume(s: Session, run_session_id: str, presented_id: str) -> dict:
    """
    Stage 5 entry. Race-safe: the ACTIVE -> USED flip is a single conditional UPDATE, so two
    concurrent submissions of one key can never both be accepted.

    Returns {"found": bool, "status": "ACTIVE"|"USED"|None, "outcome": <LOOKUP_OUTCOME>}
    `status` is the status AT lookup time (what the UI's ledger event shows).
    """
    flipped = s.execute(
        update(SessionLedger)
        .where(SessionLedger.session_id == presented_id, SessionLedger.status == "ACTIVE")
        .values(status="USED", consumed_at=text("now()"))
    ).rowcount

    if flipped == 1:
        found, status, outcome = True, "ACTIVE", "ACCEPTED_ACTIVE"
    else:
        row = s.get(SessionLedger, presented_id)
        if row is not None and row.status == "USED":
            found, status, outcome = True, "USED", "REJECTED_USED"
        else:  # never issued, or REFUSED (never admitted) -> indistinguishable from unknown by design
            found, status, outcome = False, None, "REJECTED_NOT_FOUND"

    s.add(
        LedgerLookup(
            run_session_id=run_session_id,
            queried_id=presented_id,
            found=found,
            status_at_lookup=status,
            outcome=outcome,
        )
    )
    s.flush()
    return {"found": found, "status": status, "outcome": outcome}


def most_recent_used_session(s: Session, exclude: str) -> str | None:
    """Victim for the 'replay / used' scenario: a genuinely consumed, honest, non-replay session."""
    row = s.execute(
        text(
            "SELECT l.session_id FROM session_ledger l JOIN runs r ON r.session_id = l.session_id "
            "WHERE l.status = 'USED' AND r.verdict = 'ACCEPTED' AND r.attack = 'no-attack' "
            "AND l.session_id <> :ex ORDER BY l.consumed_at DESC LIMIT 1"
        ),
        {"ex": exclude},
    ).first()
    return row[0] if row else None


if __name__ == "__main__":
    init_db()
    names = sorted(inspect(engine).get_table_names())
    with transaction() as s:
        n = s.execute(text("SELECT count(*) FROM attack_catalog")).scalar_one()
    print("tables:", ", ".join(names))
    print("attack_catalog rows:", n)
