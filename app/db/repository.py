"""
Repository (REPORT §9.3): the only module that talks to the kit's tables.
Write side: allocate key → insert RUNNING → run pipeline → persist everything
in ONE transaction → COMPLETED. Read side: /events, /result, /logs, /history
are served from the database only — never recomputed.
"""
from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import db as kit
from app.db.models import (
    AttackCatalog, LedgerLookup, Run, RunEvent, RunLog, SessionLedger,
    VerifierResult,
)
from app.engine.records import RunRecord

CATALOG_VERSION = 1


# ------------------------------------------------------------------ catalog
def load_catalog(s: Session) -> dict[str, dict]:
    rows = s.execute(select(AttackCatalog)).scalars().all()
    out: dict[str, dict] = {}
    for r in rows:
        out[r.attack_key] = {
            "attack_key": r.attack_key, "attack": r.attack, "subtype": r.subtype,
            "label": r.label, "classification": r.classification,
            "category_part": int(r.category_part),
            "injected_between": r.injected_between, "caught_by": r.caught_by,
            "root_cause": r.root_cause, "mitigations": list(r.mitigations),
            "story": r.story,
        }
    return out


# ------------------------------------------------------------------ ledger port
class DbLedger:
    """LedgerPort backed by the kit's session_ledger + ledger_lookups tables.
    All calls run inside the caller's transaction/Session."""

    def __init__(self, s: Session):
        self.s = s

    def admit(self, session_id: str) -> None:
        kit.admit_session(self.s, session_id)

    def refuse(self, session_id: str) -> None:
        kit.refuse_session(self.s, session_id)

    def lookup(self, run_session_id: str, presented_id: str) -> dict:
        return kit.ledger_lookup_and_consume(self.s, run_session_id, presented_id)

    def victim(self, exclude: str) -> Optional[str]:
        return kit.most_recent_used_session(self.s, exclude=exclude)

    def unissued(self) -> str:
        return kit.unissued_key(self.s)


# ------------------------------------------------------------------ write side
def allocate_key(s: Session) -> str:
    return kit.new_session_key(s)


def insert_running(s: Session, session_id: str, seed: int, config: dict,
                   attack_key: str, params: dict, engine_version: str,
                   origin: str = "user", rerun_of: Optional[str] = None) -> None:
    s.add(Run(
        session_id=session_id, seed=seed, origin=origin, rerun_of=rerun_of,
        status="RUNNING", attack_key=attack_key,
        attack=config["attack"], subtype=config.get("subtype"),
        message=config["message"], tampered_message=config.get("tamperedMessage"),
        target_link=config.get("targetLink"), fixed_basis=config.get("fixedBasis"),
        intensity_pct=config.get("intensityPct"), replay_type=config.get("replayType"),
        config=config, params=params, engine_version=engine_version,
    ))
    s.flush()


def persist(s: Session, rec: RunRecord) -> None:
    """Everything a completed run produced, one transaction (caller commits)."""
    s.execute(update(Run).where(Run.session_id == rec.session_id).values(
        status="COMPLETED", verdict=rec.verdict, classification=rec.classification,
        detected_key=rec.detected_key, confidence=rec.confidence,
        severity_score=rec.severity, stopped_at=rec.stopped_at,
        injected_at=rec.injected_at, story=rec.story, result=rec.result,
        params=rec.params, completed_at=dt.datetime.now(dt.timezone.utc),
        duration_ms=rec.duration_ms,
    ))
    for seq, ev in enumerate(rec.events):
        payload = {k: v for k, v in ev.items() if k != "kind"}
        s.add(RunEvent(session_id=rec.session_id, seq=seq,
                       kind=ev["kind"], t_ms=ev["tMs"], payload=payload))
    for seq, lg in enumerate(rec.logs):
        s.add(RunLog(session_id=rec.session_id, seq=seq, time_ms=lg["timeMs"],
                     stage=lg["stage"], actor=lg["actor"], code=lg["code"],
                     level=lg["level"], message=lg["message"], payload=lg["payload"]))
    for row in rec.verifier_rows:
        s.add(VerifierResult(session_id=rec.session_id, **row))
    s.flush()


def mark_failed(s: Session, session_id: str, error: str) -> None:
    s.execute(update(Run).where(Run.session_id == session_id).values(
        status="FAILED", error=error[:4000],
        completed_at=dt.datetime.now(dt.timezone.utc)))
    # a failed run's key must never verify anything later
    row = s.get(SessionLedger, session_id)
    if row is None:
        s.add(SessionLedger(session_id=session_id, status="REFUSED"))
    elif row.status == "ACTIVE":
        row.status = "REFUSED"
    s.flush()


# ------------------------------------------------------------------ read side
def get_run(s: Session, session_id: str) -> Optional[Run]:
    return s.get(Run, session_id)


def events_of(s: Session, session_id: str) -> list[dict]:
    rows = s.execute(select(RunEvent).where(RunEvent.session_id == session_id)
                     .order_by(RunEvent.seq)).scalars().all()
    return [{"kind": r.kind, **r.payload} for r in rows]


def logs_of(s: Session, session_id: str, stage: Optional[str] = None,
            actor: Optional[str] = None, level: Optional[str] = None,
            q: Optional[str] = None) -> list[dict]:
    stmt = select(RunLog).where(RunLog.session_id == session_id)
    if stage and stage != "all":
        stmt = stmt.where(RunLog.stage == stage)
    if actor and actor != "all":
        stmt = stmt.where(RunLog.actor == actor)
    if level and level != "all":
        stmt = stmt.where(RunLog.level == level)
    if q:
        stmt = stmt.where(RunLog.message.ilike(f"%{q}%"))
    rows = s.execute(stmt.order_by(RunLog.seq)).scalars().all()
    return [{"timeMs": r.time_ms, "stage": r.stage, "actor": r.actor,
             "code": r.code, "level": r.level, "message": r.message,
             "payload": r.payload} for r in rows]


def history(s: Session, limit: int = 200) -> dict:
    rows = s.execute(
        select(Run, AttackCatalog.label)
        .join(AttackCatalog, Run.attack_key == AttackCatalog.attack_key)
        .where(Run.status == "COMPLETED")
        .order_by(Run.created_at.desc()).limit(limit)
    ).all()
    runs = [{
        "sessionId": r.session_id,
        "timestamp": r.created_at.isoformat(),
        "attack": r.attack, "subtype": r.subtype,
        "targetLink": r.target_link, "verdict": r.verdict,
        "severity": int(r.severity_score or 0),
    } for r, _label in rows]

    agg = s.execute(
        select(AttackCatalog.label,
               func.count(Run.session_id),
               func.count(Run.session_id).filter(Run.verdict == "REJECTED"),
               func.avg(Run.severity_score))
        .join(Run, Run.attack_key == AttackCatalog.attack_key)
        .where(Run.status == "COMPLETED")
        .group_by(AttackCatalog.label)
        .order_by(AttackCatalog.label)
    ).all()
    by_attack = [{"attack": label, "runs": int(n), "detected": int(det),
                  "meanSeverity": round(float(mean or 0.0), 2)}
                 for label, n, det, mean in agg]
    return {"runs": runs, "byAttack": by_attack}
