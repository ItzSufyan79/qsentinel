"""
Phase 4 gate — T18 runtime, T19 determinism, T20 ledger concurrency,
T21 FAILED path. Runs against the live PostgreSQL in DATABASE_URL; each test
that writes uses throwaway session ids and cleans up after itself.
"""
from __future__ import annotations

import copy
import threading
import time

import pytest
from sqlalchemy import delete, select

from app.db import db as kit
from app.db import repository as repo
from app.db.models import LedgerLookup, Run, RunEvent, RunLog, SessionLedger, VerifierResult
from app.engine import pipeline
from app.engine.constants import ENGINE_VERSION, SYSTEM_PARAMS
from app.fixtures import FIXTURES, seed_fixtures


def _cleanup(session_ids: list[str]) -> None:
    with kit.transaction() as s:
        # organic reruns may reference these runs; detach them first
        from sqlalchemy import update
        s.execute(update(Run).where(Run.rerun_of.in_(session_ids))
                  .values(rerun_of=None))
        for t in (LedgerLookup, RunEvent, RunLog, VerifierResult, SessionLedger):
            col = t.run_session_id if t is LedgerLookup else t.session_id
            s.execute(delete(t).where(col.in_(session_ids)))
        s.execute(delete(Run).where(Run.session_id.in_(session_ids)))


@pytest.fixture(scope="module")
def catalog():
    with kit.transaction() as s:
        return repo.load_catalog(s)


class MemLedger:
    """In-memory LedgerPort for pipeline-only tests (no DB rows)."""

    def __init__(self):
        self.status: dict[str, str] = {}

    def admit(self, sid): self.status[sid] = "ACTIVE"
    def refuse(self, sid): self.status[sid] = "REFUSED"

    def lookup(self, run_sid, presented):
        st = self.status.get(presented)
        if st is None:
            return {"outcome": "REJECTED_NOT_FOUND", "found": False, "status": None}
        if st != "ACTIVE":
            return {"outcome": "REJECTED_USED" if st == "USED" else "REJECTED_NOT_FOUND",
                    "found": st == "USED", "status": st if st == "USED" else None}
        self.status[presented] = "USED"
        return {"outcome": "ACCEPTED_ACTIVE", "found": True, "status": "ACTIVE"}

    def victim(self, exclude):
        return next((k for k, v in self.status.items()
                     if v == "USED" and k != exclude), None)

    def unissued(self): return "zzzzzzzz"


# ---------------------------------------------------------------- T18: runtime
def test_t18_every_scenario_under_8s(catalog):
    led = MemLedger()
    worst = 0.0
    for sid, seed, cfg, _ in FIXTURES:
        t0 = time.monotonic()
        pipeline.run(sid, seed, cfg, catalog, led)
        dtv = time.monotonic() - t0
        worst = max(worst, dtv)
        assert dtv < 8.0, f"{sid} took {dtv:.2f}s (hard limit 8s)"
    print(f"worst-case scenario runtime: {worst:.2f}s")


# ---------------------------------------------------------------- T19: determinism
def _strip_ids(obj, sid: str):
    """Replace the session id everywhere so two runs of the same (config, seed)
    under different ids can be compared field-for-field."""
    if isinstance(obj, dict):
        return {k: _strip_ids(v, sid) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_strip_ids(v, sid) for v in obj]
    if isinstance(obj, str):
        return obj.replace(sid, "<SID>")
    return obj


@pytest.mark.parametrize("idx", [0, 1, 5, 7, 9])  # honest, forgery, fixed, partial, correction
def test_t19_determinism_modulo_session_id(catalog, idx):
    _, seed, cfg, _ = FIXTURES[idx]
    a = pipeline.run("aaaa0001", seed, copy.deepcopy(cfg), catalog, MemLedger())
    b = pipeline.run("bbbb0002", seed, copy.deepcopy(cfg), catalog, MemLedger())
    for field in ("events", "logs", "result"):
        va = _strip_ids(getattr(a, field), "aaaa0001")
        vb = _strip_ids(getattr(b, field), "bbbb0002")
        assert va == vb, f"{field} differs for fixture {idx} under same (config, seed)"
    assert a.verdict == b.verdict and a.detected_key == b.detected_key
    assert a.severity == b.severity and a.confidence == b.confidence
    # a different seed must change the physics (events differ beyond ids)
    c = pipeline.run("aaaa0001", seed + 1, copy.deepcopy(cfg), catalog, MemLedger())
    assert _strip_ids(c.events, "aaaa0001") != _strip_ids(a.events, "aaaa0001")


# ---------------------------------------------------------------- T20: ledger race
def test_t20_concurrent_consume_exactly_one():
    ids = ["t20aaaaa", "t20bbbbb", "t20ccccc"]
    _cleanup(ids)
    with kit.transaction() as s:
        for sid in ids:
            s.add(Run(session_id=sid, seed=1, status="RUNNING", attack_key="no-attack",
                      attack="no-attack", message="x", config={}, params={},
                      engine_version=ENGINE_VERSION))
        s.flush()
        kit.admit_session(s, ids[0])  # the key both racers present

    outcomes: list[str] = []
    barrier = threading.Barrier(2)

    def racer(run_sid: str):
        with kit.transaction() as s:
            barrier.wait()
            out = kit.ledger_lookup_and_consume(s, run_sid, ids[0])
            outcomes.append(out["outcome"])

    threads = [threading.Thread(target=racer, args=(sid,)) for sid in ids[1:]]
    for t in threads: t.start()
    for t in threads: t.join()

    assert sorted(outcomes) == ["ACCEPTED_ACTIVE", "REJECTED_USED"], outcomes
    with kit.transaction() as s:
        row = s.get(SessionLedger, ids[0])
        assert row.status == "USED" and row.consumed_at is not None
        lookups = s.execute(select(LedgerLookup)
                            .where(LedgerLookup.queried_id == ids[0])).scalars().all()
        assert len(lookups) == 2
    _cleanup(ids)


# ---------------------------------------------------------------- T21: FAILED path
def test_t21_failed_run_leaves_no_partial_children(catalog):
    sid = "t21fail1"
    _cleanup([sid])
    cfg = dict(FIXTURES[0][2])
    # 1st transaction: RUNNING row exists
    with kit.transaction() as s:
        repo.insert_running(s, sid, 7, cfg, "no-attack",
                            dict(SYSTEM_PARAMS), ENGINE_VERSION)

    class Boom(RuntimeError): ...

    class ExplodingLedger(MemLedger):
        def admit(self, sid):  # detonate mid-pipeline, after physics started
            raise Boom("simulated crash inside the run transaction")

    try:
        with kit.transaction() as s:
            rec = pipeline.run(sid, 7, cfg, catalog, ExplodingLedger())
            repo.persist(s, rec)  # never reached
    except Boom:
        with kit.transaction() as s:
            repo.mark_failed(s, sid, "simulated crash")
    else:
        pytest.fail("pipeline did not raise")

    with kit.transaction() as s:
        run = s.get(Run, sid)
        assert run.status == "FAILED" and run.error and run.result is None
        for t in (RunEvent, RunLog, VerifierResult):
            n = len(s.execute(select(t).where(t.session_id == sid)).scalars().all())
            assert n == 0, f"partial {t.__tablename__} rows leaked"
        ledger = s.get(SessionLedger, sid)
        assert ledger is not None and ledger.status == "REFUSED"
    _cleanup([sid])


# ---------------------------------------------------------------- fixtures on DB
def test_fixture_seeding_idempotent_and_replay_used_victim():
    fixture_ids = [f[0] for f in FIXTURES]
    _cleanup(fixture_ids)
    with kit.transaction() as s:
        n = seed_fixtures(s)
    assert n == 10
    with kit.transaction() as s:
        assert seed_fixtures(s) == 0  # idempotent
        run = s.get(Run, "m4v7p3")
        assert run.result["verdictBanner"]["ledger"]["queriedId"] == "honest7"
        assert run.result["stoppedAt"] == "verify"
        honest = s.get(SessionLedger, "honest7")
        assert honest.status == "USED"
        imp = s.get(SessionLedger, "k9r2xq")
        assert imp.status == "REFUSED"
        # events/logs/verifiers persisted for every fixture
        for sid in fixture_ids:
            assert len(repo.events_of(s, sid)) > 0
            assert len(repo.logs_of(s, sid)) > 0
        # logs ILIKE filter works
        hits = repo.logs_of(s, "e4f5a1", q="eve")
        assert hits and all("eve" in h["message"].lower() for h in hits)
        # history endpoint shape
        h = repo.history(s)
        assert len(h["runs"]) >= 10
        labels = {row["attack"] for row in h["byAttack"]}
        assert "No attack" in labels or any("attack" in l.lower() for l in labels)
