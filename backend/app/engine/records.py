"""RunRecord — the frozen seam between engine, database and API (REPORT §8).

The engine returns exactly one of these per run. The database layer stores it
verbatim; the API layer reads it back — no recomputation, ever. Do not edit
this shape without updating the report and its tests.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class RunRecord:
    session_id: str
    seed: int
    config: dict                      # resolved config echo (camelCase, as the UI sees it)
    events: list[dict] = field(default_factory=list)   # exact SSE frames (camelCase as types.ts)
    logs: list[dict] = field(default_factory=list)     # exact LogRow dicts
    result: dict = field(default_factory=dict)         # exact ResultResponse dict
    verifier_rows: list[dict] = field(default_factory=list)  # for verifier_results
    ledger_lookups: list[dict] = field(default_factory=list)
    ledger_final: str = "ACTIVE"      # ACTIVE|USED|REFUSED
    attack_key: str = "no-attack"
    detected_key: str = "no-attack"
    verdict: str = "ACCEPTED"
    classification: str = ""
    confidence: float = 0.0
    severity: int = 0
    stopped_at: Optional[str] = None
    injected_at: Optional[str] = None
    story: str = ""
    params: dict = field(default_factory=dict)
    engine_version: str = ""
    duration_ms: int = 0
