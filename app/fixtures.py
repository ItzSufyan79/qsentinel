"""
Fixtures (REPORT §9.6): the mock's ten pinned scenarios, executed for REAL
through the same pipeline user runs take. Session ids and configs mirror
mockApi.ts verbatim; seeds are pinned so every fresh database gets identical,
reproducible fixture rows. honest7 runs FIRST so m4v7p3 (replay-used) has a
consumed session to present.

Seeds were chosen by search so each scenario lands on its intended outcome
(honest ACCEPTED, partial-25% REJECTED, etc.). If a seed ever stops producing
its outcome the assertion below fails loudly at startup — that would mean the
engine changed, which must bump ENGINE_VERSION.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.db import repository as repo
from app.engine import pipeline

log = logging.getLogger("qsentinel.fixtures")

# (session_id, seed, config, expected_verdict)
FIXTURES: list[tuple[str, int, dict, str]] = [
    ("honest7", 424242, {"attack": "no-attack", "subtype": None, "message": "TRANSFER 1000",
                         "tamperedMessage": None, "targetLink": None, "fixedBasis": None,
                         "intensityPct": None, "replayType": None}, "ACCEPTED"),
    ("e4f5a1", 111001, {"attack": "forgery", "subtype": None, "message": "PAYROLL JULY",
                        "tamperedMessage": None, "targetLink": "both", "fixedBasis": None,
                        "intensityPct": None, "replayType": None}, "REJECTED"),
    ("k9r2xq", 111002, {"attack": "impersonation", "subtype": None, "message": "GRANT ACCESS",
                        "tamperedMessage": None, "targetLink": None, "fixedBasis": None,
                        "intensityPct": None, "replayType": None}, "REJECTED"),
    ("m4v7p3", 111003, {"attack": "replay", "subtype": None, "message": "OLD PAYMENT",
                        "tamperedMessage": None, "targetLink": None, "fixedBasis": None,
                        "intensityPct": None, "replayType": "used"}, "REJECTED"),
    ("b7z2c8", 111004, {"attack": "replay", "subtype": None, "message": "SPOOFED ID",
                        "tamperedMessage": None, "targetLink": None, "fixedBasis": None,
                        "intensityPct": None, "replayType": "unknown"}, "REJECTED"),
    ("w6n9j1", 111005, {"attack": "tampering", "subtype": "fixed-basis", "message": "SHARE RESULTS",
                        "tamperedMessage": None, "targetLink": "both", "fixedBasis": "Z",
                        "intensityPct": None, "replayType": None}, "REJECTED"),
    ("q3h8d5", 111006, {"attack": "tampering", "subtype": "random-basis", "message": "PUBLISH LEDGER",
                        "tamperedMessage": None, "targetLink": "bob", "fixedBasis": None,
                        "intensityPct": None, "replayType": None}, "REJECTED"),
    ("t5c1r7", 111007, {"attack": "tampering", "subtype": "partial", "message": "SECRET KEY m1",
                        "tamperedMessage": None, "targetLink": "both", "fixedBasis": None,
                        "intensityPct": 25, "replayType": None}, "REJECTED"),
    ("n2y6u4", 111008, {"attack": "tampering", "subtype": "message-substitution", "message": "TRANSFER 500",
                        "tamperedMessage": "TRANSFER 5000", "targetLink": "both", "fixedBasis": None,
                        "intensityPct": None, "replayType": None}, "REJECTED"),
    ("j8k3w9", 111009, {"attack": "tampering", "subtype": "correction-bit", "message": "BONUS RELEASE",
                        "tamperedMessage": None, "targetLink": "bob", "fixedBasis": None,
                        "intensityPct": None, "replayType": None}, "REJECTED"),
]


def seed_fixtures(s: Session) -> int:
    """Idempotent: skips ids that already exist. Returns the number created."""
    catalog = repo.load_catalog(s)
    created = 0
    for session_id, seed, config, expected in FIXTURES:
        if repo.get_run(s, session_id) is not None:
            continue
        attack_key = pipeline.attack_key_of(config)
        from app.engine.constants import ENGINE_VERSION, SYSTEM_PARAMS
        repo.insert_running(s, session_id, seed, config, attack_key,
                            dict(SYSTEM_PARAMS), ENGINE_VERSION, origin="fixture")
        rec = pipeline.run(session_id, seed, config, catalog, repo.DbLedger(s))
        if rec.verdict != expected:
            raise RuntimeError(
                f"fixture {session_id}: seed {seed} produced {rec.verdict}, "
                f"expected {expected} — engine changed? bump ENGINE_VERSION")
        repo.persist(s, rec)
        created += 1
        log.info("fixture %s (%s) -> %s", session_id, attack_key, rec.verdict)
    return created
