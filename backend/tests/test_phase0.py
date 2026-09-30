"""Phase 0 gate (REPORT §12): kit DB test + schema round-trip on mock-generated data."""
from __future__ import annotations

import json
import pathlib

import pytest
from pydantic import TypeAdapter
from sqlalchemy.exc import IntegrityError

from app.api import schemas as S
from app.db.db import (
    SessionLocal, admit_session, init_db, ledger_lookup_and_consume,
    most_recent_used_session, new_session_key, refuse_session, unissued_key,
)
from app.db.models import Run, SessionLedger

FIX = pathlib.Path(__file__).parent / "fixtures" / "mock-dump.json"


# ---------------------------------------------------------------- kit DB
@pytest.fixture(scope="module")
def db():
    init_db()
    with SessionLocal.begin() as s:
        yield s
        s.rollback()  # phase-0 checks leave no rows behind


def _stub_run(s, sid: str, attack="no-attack"):
    s.add(Run(session_id=sid, seed=1, attack_key=attack, attack=attack,
              message="PING", config={}, params={}, engine_version="0"))
    s.flush()


def test_tables_and_catalog(db):
    from sqlalchemy import inspect, text
    names = set(inspect(db.get_bind()).get_table_names())
    assert names >= {"attack_catalog", "runs", "run_events", "run_logs",
                     "verifier_results", "session_ledger", "ledger_lookups"}
    n = db.execute(text("SELECT count(*) FROM attack_catalog")).scalar_one()
    assert n == 10


def test_ledger_lifecycle(db):
    sid = new_session_key(db)
    _stub_run(db, sid)
    admit_session(db, sid)
    r1 = ledger_lookup_and_consume(db, sid, sid)
    assert r1 == {"found": True, "status": "ACTIVE", "outcome": "ACCEPTED_ACTIVE"}
    r2 = ledger_lookup_and_consume(db, sid, sid)          # replay of a USED key
    assert r2 == {"found": True, "status": "USED", "outcome": "REJECTED_USED"}
    ghost = unissued_key(db)
    r3 = ledger_lookup_and_consume(db, sid, ghost)        # never issued
    assert r3 == {"found": False, "status": None, "outcome": "REJECTED_NOT_FOUND"}


def test_refused_reads_as_not_found(db):
    sid = new_session_key(db)
    _stub_run(db, sid, attack="impersonation")
    refuse_session(db, sid)
    r = ledger_lookup_and_consume(db, sid, sid)
    assert r["outcome"] == "REJECTED_NOT_FOUND" and r["found"] is False


def test_constraints_reject_bad_rows(db):
    with db.begin_nested():
        with pytest.raises(IntegrityError):
            db.add(Run(session_id="badmsg01", seed=1, attack_key="no-attack", attack="no-attack",
                       message="", config={}, params={}, engine_version="0"))
            db.flush()
    with db.begin_nested():
        with pytest.raises(IntegrityError):
            db.add(Run(session_id="badseed1", seed=2**53, attack_key="no-attack", attack="no-attack",
                       message="X", config={}, params={}, engine_version="0"))
            db.flush()
    with db.begin_nested():
        with pytest.raises(IntegrityError):
            sid = new_session_key(db)
            _stub_run(db, sid)
            db.add(SessionLedger(session_id=sid, status="USED", consumed_at=None))
            db.flush()


# ---------------------------------------------------------------- schema round-trip
@pytest.fixture(scope="module")
def dump():
    return json.loads(FIX.read_text())


DIAG_STUB = {"key": "no-attack", "cause": "stub", "mitigation": ["stub"]}  # D18 addition; the TS mock gains its own copy in Phase 6


def test_result_roundtrip_all_ten(dump):
    for name, blob in dump.items():
        raw = dict(blob["result"])
        raw["verdictBanner"] = dict(raw["verdictBanner"], diagnosis=DIAG_STUB)
        model = S.ResultResponse.model_validate(raw)
        back = model.model_dump(mode="json")
        assert back == raw, f"{name}: round-trip drift"


def test_events_roundtrip_all_ten(dump):
    ta = TypeAdapter(list[S.RunEvent])
    for name, blob in dump.items():
        evs = ta.validate_python(blob["events"])
        assert evs[-1].kind == "done", name
        kinds = {e.kind for e in evs}
        assert "session" in kinds and "fidelity" in kinds, name


def test_logs_and_config_roundtrip(dump):
    for name, blob in dump.items():
        rows = TypeAdapter(list[S.LogRow]).validate_python(blob["logs"])
        assert rows, name
        S.RunConfig.model_validate(blob["config"])
