"""
QSentinel — PostgreSQL models (SQLAlchemy 2.0).

Seven tables. Everything is written by the engine in ONE transaction when a run
completes (see REPORT §9), except `session_ledger` / `ledger_lookups`, which are
also touched inside the run at the moment they occur (stage 1 admission, stage 5
lookup) and committed with the same transaction.

    attack_catalog     seeded, editable content: root cause + mitigations + story per attack
    runs               one row per session (config, verdict, severity, full result JSON)
    run_events         every SSE event of a run, in order  (replayed by GET /events)
    run_logs           the System Logs rows of a run       (served by GET /logs, audit trail)
    verifier_results   Bob / Charlie outcome per run       (queryable projection)
    session_ledger     single-use session keys: ACTIVE -> USED (anti-replay)
    ledger_lookups     every ledger lookup ever made       (security audit of replays)

Rules baked into the schema:
  * No key material, no qubit state, no per-slot secret is EVER stored.
  * Audit tables (run_events, run_logs, verifier_results, ledger_lookups) are
    append-only by convention: give the app's DB role INSERT+SELECT only on them.
  * Enumerations are TEXT + CHECK constraints (not native ENUM) so adding a value
    later does not need ALTER TYPE.
"""
from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ---- allowed values (single source; the API layer imports these too) -------------
RUN_STATUS = ("RUNNING", "COMPLETED", "FAILED")
RUN_ORIGIN = ("user", "system_baseline", "fixture")
VERDICT = ("ACCEPTED", "REJECTED")
VERIFIER_VERDICT = ("ACCEPTED", "REJECTED", "NOT_RUN")  # API shows "NOT RUN" (with a space)
ATTACK = ("no-attack", "forgery", "impersonation", "replay", "tampering")
SUBTYPE = ("fixed-basis", "random-basis", "partial", "message-substitution", "correction-bit")
TARGET_LINK = ("bob", "charlie", "both")
STAGE = ("fidelity", "keys", "distribute", "sign", "verify", "analysis")
ACTOR = ("alice", "bob", "charlie", "eve", "system")
LOG_LEVEL = ("info", "check", "attack")
LEDGER_STATUS = ("ACTIVE", "USED", "REFUSED")  # REFUSED = impersonation: never admitted (never shown in the API)
LOOKUP_OUTCOME = ("ACCEPTED_ACTIVE", "REJECTED_USED", "REJECTED_NOT_FOUND")
VERIFIER = ("bob", "charlie")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


def _in_or_null(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IS NULL OR {_in(col, values)}"


class Base(DeclarativeBase):
    pass


# =================================================================================
# 1. attack_catalog — root cause, mitigations, story, category (seeded, see seed_catalog.py)
# =================================================================================
class AttackCatalog(Base):
    __tablename__ = "attack_catalog"

    # 'no-attack' | 'forgery' | 'impersonation' | 'replay-used' | 'replay-unknown'
    # | 'tampering-<subtype>'
    attack_key: Mapped[str] = mapped_column(String(48), primary_key=True)
    attack: Mapped[str] = mapped_column(String(16), nullable=False)
    subtype: Mapped[Optional[str]] = mapped_column(String(24))
    label: Mapped[str] = mapped_column(String(64), nullable=False)  # History group label
    classification: Mapped[str] = mapped_column(String(96), nullable=False)  # the ground-truth class name
    category_part: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # severity categoryPart 0..10
    injected_between: Mapped[str] = mapped_column(String(96), nullable=False)
    caught_by: Mapped[str] = mapped_column(String(96), nullable=False)
    root_cause: Mapped[str] = mapped_column(Text, nullable=False)
    mitigations: Mapped[list[str]] = mapped_column(JSONB, nullable=False)  # JSON array of strings
    story: Mapped[str] = mapped_column(Text, nullable=False)  # one-sentence banner story
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(_in("attack", ATTACK), name="ck_catalog_attack"),
        CheckConstraint(_in_or_null("subtype", SUBTYPE + ("used", "unknown")), name="ck_catalog_subtype"),  # replay rows carry used/unknown
        CheckConstraint("category_part BETWEEN 0 AND 10", name="ck_catalog_category"),
    )


# =================================================================================
# 2. runs — one row per session
# =================================================================================
class Run(Base):
    __tablename__ = "runs"

    session_id: Mapped[str] = mapped_column(String(8), primary_key=True)  # random single-use session key
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)  # < 2**53 (JS-safe integer)
    origin: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    rerun_of: Mapped[Optional[str]] = mapped_column(ForeignKey("runs.session_id"))
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="RUNNING")

    # ground truth = what the user asked Eve to do
    attack_key: Mapped[str] = mapped_column(ForeignKey("attack_catalog.attack_key"), nullable=False)
    attack: Mapped[str] = mapped_column(String(16), nullable=False)
    subtype: Mapped[Optional[str]] = mapped_column(String(24))
    message: Mapped[str] = mapped_column(String(64), nullable=False)
    tampered_message: Mapped[Optional[str]] = mapped_column(String(64))
    target_link: Mapped[Optional[str]] = mapped_column(String(8))
    fixed_basis: Mapped[Optional[str]] = mapped_column(String(1))
    intensity_pct: Mapped[Optional[int]] = mapped_column(SmallInteger)
    replay_type: Mapped[Optional[str]] = mapped_column(String(8))
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)  # resolved config echo (camelCase, as the UI sees it)

    # reproducibility / audit
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)  # slots, bags, pass line, gate, noise q, N_test, ...
    engine_version: Mapped[str] = mapped_column(String(16), nullable=False)

    # outcome (NULL until COMPLETED). `classification` / `detected_key` come from EVIDENCE, not from config.
    verdict: Mapped[Optional[str]] = mapped_column(String(8))
    classification: Mapped[Optional[str]] = mapped_column(String(96))
    detected_key: Mapped[Optional[str]] = mapped_column(String(48))  # catalog key the evidence points to, or 'no-attack'
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    severity_score: Mapped[Optional[int]] = mapped_column(SmallInteger)
    stopped_at: Mapped[Optional[str]] = mapped_column(String(12))
    injected_at: Mapped[Optional[str]] = mapped_column(String(12))
    story: Mapped[Optional[str]] = mapped_column(Text)
    result: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)  # the exact ResultResponse served by GET /result
    error: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)

    __table_args__ = (
        CheckConstraint(_in("status", RUN_STATUS), name="ck_runs_status"),
        CheckConstraint(_in("origin", RUN_ORIGIN), name="ck_runs_origin"),
        CheckConstraint(_in("attack", ATTACK), name="ck_runs_attack"),
        CheckConstraint(_in_or_null("subtype", SUBTYPE), name="ck_runs_subtype"),
        CheckConstraint(_in_or_null("target_link", TARGET_LINK), name="ck_runs_target"),
        CheckConstraint(_in_or_null("fixed_basis", ("Z", "X", "Y")), name="ck_runs_basis"),
        CheckConstraint(_in_or_null("replay_type", ("used", "unknown")), name="ck_runs_replay"),
        CheckConstraint(_in_or_null("verdict", VERDICT), name="ck_runs_verdict"),
        CheckConstraint(_in_or_null("stopped_at", STAGE), name="ck_runs_stopped"),
        CheckConstraint(_in_or_null("injected_at", STAGE), name="ck_runs_injected"),
        CheckConstraint("char_length(message) BETWEEN 1 AND 64", name="ck_runs_message_len"),
        CheckConstraint("intensity_pct IS NULL OR intensity_pct BETWEEN 5 AND 100", name="ck_runs_intensity"),
        CheckConstraint("severity_score IS NULL OR severity_score BETWEEN 0 AND 10", name="ck_runs_severity"),
        CheckConstraint("confidence IS NULL OR confidence BETWEEN 0 AND 1", name="ck_runs_confidence"),
        CheckConstraint("seed >= 0 AND seed < 9007199254740992", name="ck_runs_seed_js_safe"),
        CheckConstraint(
            "status <> 'COMPLETED' OR (verdict IS NOT NULL AND result IS NOT NULL AND completed_at IS NOT NULL)",
            name="ck_runs_completed_has_outcome",
        ),
        Index("ix_runs_created_at", text("created_at DESC")),
        Index("ix_runs_attack_verdict", "attack_key", "verdict"),
    )


# =================================================================================
# 3. run_events — SSE frames, in order
# =================================================================================
class RunEvent(Base):
    __tablename__ = "run_events"

    session_id: Mapped[str] = mapped_column(ForeignKey("runs.session_id"), primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)  # 0.. in emission order
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    t_ms: Mapped[int] = mapped_column(Integer, nullable=False)  # deterministic logical clock, not wall clock
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)  # the complete frame, exactly as sent

    __table_args__ = (
        CheckConstraint(
            "kind IN ('session','fidelity','keys','distribute','sign','inject','ledger',"
            "'verify-bag','verify-done','analysis','log','done')",
            name="ck_events_kind",
        ),
    )


# =================================================================================
# 4. run_logs — System Logs rows (also the security audit trail)
# =================================================================================
class RunLog(Base):
    __tablename__ = "run_logs"

    session_id: Mapped[str] = mapped_column(ForeignKey("runs.session_id"), primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    time_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    stage: Mapped[str] = mapped_column(String(12), nullable=False)
    actor: Mapped[str] = mapped_column(String(8), nullable=False)
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    level: Mapped[str] = mapped_column(String(8), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(_in("stage", STAGE), name="ck_logs_stage"),
        CheckConstraint(_in("actor", ACTOR), name="ck_logs_actor"),
        CheckConstraint(_in("level", LOG_LEVEL), name="ck_logs_level"),
        Index("ix_logs_run_time", "session_id", "time_ms"),
        Index("ix_logs_code", "code"),
        Index("ix_logs_level_created", "level", text("created_at DESC")),
    )


# =================================================================================
# 5. verifier_results — Bob / Charlie per run
# =================================================================================
class VerifierResult(Base):
    __tablename__ = "verifier_results"

    session_id: Mapped[str] = mapped_column(ForeignKey("runs.session_id"), primary_key=True)
    verifier: Mapped[str] = mapped_column(String(8), primary_key=True)
    verdict: Mapped[str] = mapped_column(String(8), nullable=False)
    bags_wrong: Mapped[Optional[list[int]]] = mapped_column(ARRAY(SmallInteger))  # exactly 63 ints, or NULL when NOT_RUN
    rate_z: Mapped[Optional[float]] = mapped_column(Float)
    rate_x: Mapped[Optional[float]] = mapped_column(Float)
    rate_y: Mapped[Optional[float]] = mapped_column(Float)
    passed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    worst_bag_index: Mapped[Optional[int]] = mapped_column(SmallInteger)
    worst_bag_wrong: Mapped[Optional[int]] = mapped_column(SmallInteger)

    __table_args__ = (
        CheckConstraint(_in("verifier", VERIFIER), name="ck_vr_verifier"),
        CheckConstraint(_in("verdict", VERIFIER_VERDICT), name="ck_vr_verdict"),
        CheckConstraint(
            "(verdict = 'NOT_RUN' AND bags_wrong IS NULL) OR "
            "(verdict <> 'NOT_RUN' AND array_length(bags_wrong, 1) = 63)",
            name="ck_vr_bags_len",
        ),
        CheckConstraint("passed + failed IN (0, 63)", name="ck_vr_total"),
    )


# =================================================================================
# 6. session_ledger — single-use session keys
# =================================================================================
class SessionLedger(Base):
    __tablename__ = "session_ledger"

    session_id: Mapped[str] = mapped_column(ForeignKey("runs.session_id"), primary_key=True)
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    issued_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    consumed_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(_in("status", LEDGER_STATUS), name="ck_ledger_status"),
        CheckConstraint(
            "(status = 'USED') = (consumed_at IS NOT NULL)",
            name="ck_ledger_used_has_time",
        ),
    )


# =================================================================================
# 7. ledger_lookups — every lookup (the replay audit trail)
# =================================================================================
class LedgerLookup(Base):
    __tablename__ = "ledger_lookups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_session_id: Mapped[str] = mapped_column(ForeignKey("runs.session_id"), nullable=False)  # the run that asked
    queried_id: Mapped[str] = mapped_column(String(32), nullable=False)  # NOT a foreign key: may be fabricated by Eve
    found: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_at_lookup: Mapped[Optional[str]] = mapped_column(String(8))
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    looked_up_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(_in_or_null("status_at_lookup", LEDGER_STATUS), name="ck_lookup_status"),
        CheckConstraint(_in("outcome", LOOKUP_OUTCOME), name="ck_lookup_outcome"),
        Index("ix_lookup_queried", "queried_id"),
        Index("ix_lookup_run", "run_session_id"),
    )
