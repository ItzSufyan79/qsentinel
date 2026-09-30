"""
Routes (REPORT §10): 7 contract routes + GET /api/system (D17) + /api/health.
POST /api/runs is compute-then-respond: the whole run happens inside one
database transaction in a worker thread (concurrency capped at 2), and the
event stream is replayed later from run_events, unpaced.
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from app.api import validation
from app.api.errors import backend_error, invalid_state, run_not_found
from app.db import db as kit
from app.db import repository as repo
from app.engine import detection, pipeline
from app.engine.constants import (
    ENGINE_VERSION, FINGERPRINT_LIBRARY, SYSTEM_PARAMS,
)

log = logging.getLogger("qsentinel.api")
router = APIRouter(prefix="/api")

RUN_SEMAPHORE = asyncio.Semaphore(2)  # REPORT §10.1: at most two concurrent runs


# ------------------------------------------------------------------ create/rerun
def _execute_run(config: dict, seed: int, origin: str = "user",
                 rerun_of: Optional[str] = None) -> tuple[str, dict]:
    """Blocking worker: one transaction for the whole run. Returns
    (session_id, config echo). On failure, records a FAILED row separately."""
    sid_holder: list[str] = []
    try:
        with kit.transaction() as s:
            catalog = repo.load_catalog(s)
            sid = repo.allocate_key(s)
            sid_holder.append(sid)
            attack_key = pipeline.attack_key_of(config)
            repo.insert_running(s, sid, seed, config, attack_key,
                                dict(SYSTEM_PARAMS), ENGINE_VERSION,
                                origin=origin, rerun_of=rerun_of)
            ledger = repo.DbLedger(s)
            if config["attack"] == "replay" and config["replayType"] == "used" \
                    and ledger.victim(exclude=sid) is None:
                _baseline(s, catalog)  # REPORT §6.2: consume a system baseline first
            rec = pipeline.run(sid, seed, config, catalog, ledger)
            repo.persist(s, rec)
            return sid, config
    except Exception as exc:
        if sid_holder:
            sid = sid_holder[0]
            try:
                with kit.transaction() as s:
                    if repo.get_run(s, sid) is None:
                        repo.insert_running(s, sid, seed, config,
                                            pipeline.attack_key_of(config),
                                            dict(SYSTEM_PARAMS), ENGINE_VERSION,
                                            origin=origin, rerun_of=rerun_of)
                    repo.mark_failed(s, sid, f"{type(exc).__name__}: {exc}")
            except Exception:
                log.exception("could not record FAILED row for %s", sid)
        log.exception("run failed")
        raise backend_error("the run failed inside the engine",
                            detail=f"{type(exc).__name__}: {exc}") from exc


def _baseline(s, catalog) -> None:
    """An internal honest run whose key ends USED, so replay-used has a victim."""
    sid = repo.allocate_key(s)
    seed = secrets.randbelow(validation.MAX_SEED)
    cfg = {"attack": "no-attack", "subtype": None, "message": "SYSTEM BASELINE",
           "tamperedMessage": None, "targetLink": None, "fixedBasis": None,
           "intensityPct": None, "replayType": None}
    repo.insert_running(s, sid, seed, cfg, "no-attack", dict(SYSTEM_PARAMS),
                        ENGINE_VERSION, origin="system")
    rec = pipeline.run(sid, seed, cfg, catalog, repo.DbLedger(s))
    repo.persist(s, rec)


@router.post("/runs")
async def create_run(req: validation.CreateRunRequest):
    config, seed = validation.resolve_config(req)
    async with RUN_SEMAPHORE:
        sid, cfg = await asyncio.to_thread(_execute_run, config, seed)
    return {"session_id": sid, "seed": seed, "config": cfg}


@router.post("/runs/{session_id}/rerun")
async def rerun(session_id: str):
    with kit.transaction() as s:
        run = repo.get_run(s, session_id)
        if run is None:
            raise run_not_found(session_id)
        if run.status == "RUNNING":
            raise invalid_state(f"run '{session_id}' is still running")
        config = dict(run.config)
    seed = secrets.randbelow(validation.MAX_SEED)  # same settings, NEW seed + session
    async with RUN_SEMAPHORE:
        sid, _ = await asyncio.to_thread(_execute_run, config, seed,
                                         rerun_of=session_id)
    return {"session_id": sid, "seed": seed}


# ------------------------------------------------------------------ reads
def _completed_run(s, session_id: str):
    run = repo.get_run(s, session_id)
    if run is None:
        raise run_not_found(session_id)
    if run.status == "RUNNING":
        raise invalid_state(f"run '{session_id}' is still running")
    if run.status == "FAILED":
        raise invalid_state(f"run '{session_id}' failed and has no results",
                            detail=run.error)
    return run


@router.get("/runs/{session_id}/events")
async def events(session_id: str, request: Request):
    with kit.transaction() as s:
        _completed_run(s, session_id)
        frames = repo.events_of(s, session_id)

    async def stream():
        for i, frame in enumerate(frames):
            if i % 32 == 0 and await request.is_disconnected():
                return  # REPORT T23: stop within 1 s of disconnect
            yield f"data: {json.dumps(frame, separators=(',', ':'))}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no",
                                      "Connection": "keep-alive"})


@router.get("/runs/{session_id}/result")
async def result(session_id: str):
    with kit.transaction() as s:
        run = _completed_run(s, session_id)
        return run.result


@router.get("/runs/{session_id}/logs")
async def logs(session_id: str,
               stage: Optional[str] = None, actor: Optional[str] = None,
               level: Optional[str] = None, q: Optional[str] = None):
    with kit.transaction() as s:
        _completed_run(s, session_id)
        return repo.logs_of(s, session_id, stage=stage, actor=actor,
                            level=level, q=q)


@router.get("/history")
async def history():
    with kit.transaction() as s:
        return repo.history(s)


# ------------------------------------------------------------------ analytics
@router.get("/analysis/binomial")
async def binomial(n: int = Query(...), p_honest: float = Query(...),
                   p_cheat: float = Query(...)):
    validation.validate_binomial(n, p_honest, p_cheat)
    return detection.binomial_evidence(n, p_honest, p_cheat)


# ------------------------------------------------------------------ system (D17)
@router.get("/system")
async def system():
    from sqlalchemy import func, select
    from app.db.models import AttackCatalog
    with kit.transaction() as s:
        catalog_version = int(s.execute(
            select(func.max(AttackCatalog.version))).scalar() or repo.CATALOG_VERSION)
    return {
        "params": dict(SYSTEM_PARAMS),
        "fingerprintLibrary": [
            {"id": p["id"], "label": p["label"],
             "profile": [float(x) for x in p["profile"]], "meaning": p["meaning"]}
            for p in FINGERPRINT_LIBRARY],
        "engineVersion": ENGINE_VERSION,
        "catalogVersion": catalog_version,
    }


@router.get("/health")
async def health():
    with kit.transaction() as s:
        n = len(repo.load_catalog(s))
    return {"ok": True, "catalogRows": n, "engineVersion": ENGINE_VERSION}
