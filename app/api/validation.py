"""
Validation (REPORT §10.2). Turns a CreateRunRequest into the resolved
camelCase config the engine and UI both use, or raises ApiHttpError(400).
Nothing here touches the database.
"""
from __future__ import annotations

import secrets
from typing import Optional

import numpy as np

from app.api.errors import invalid_params
from app.api.schemas import CreateRunRequest
from app.engine import bch

MAX_SEED = 2 ** 53
VALID_INTENSITY = set(range(5, 101, 5))
TAMPERING_SUBTYPES = {"fixed-basis", "random-basis", "partial",
                      "message-substitution", "correction-bit"}


def _check_message(value: str, field: str) -> str:
    if not (1 <= len(value) <= 64) or not value.strip():
        raise invalid_params(f"{field} must be 1–64 characters and not blank")
    return value


def resolve_config(req: CreateRunRequest) -> tuple[dict, int]:
    """-> (camelCase config echo, seed)."""
    _check_message(req.message, "message")

    if req.seed is not None and not (0 <= req.seed < MAX_SEED):
        raise invalid_params(f"seed must be in [0, 2^53), got {req.seed}")
    seed = req.seed if req.seed is not None else secrets.randbelow(MAX_SEED)

    a = req.attack
    cfg = {"attack": a, "subtype": None, "message": req.message,
           "tamperedMessage": None, "targetLink": None, "fixedBasis": None,
           "intensityPct": None, "replayType": None}

    def forbid(*fields: tuple[str, Optional[object]]):
        for name, val in fields:
            if val is not None:
                raise invalid_params(f"{name} does not apply to attack '{a}'"
                                     + (f"/{req.subtype}" if a == "tampering" else ""))

    if a in ("no-attack", "impersonation"):
        forbid(("subtype", req.subtype), ("tampered_message", req.tampered_message),
               ("target_link", req.target_link), ("fixed_basis", req.fixed_basis),
               ("intensity_pct", req.intensity_pct), ("replay_type", req.replay_type))

    elif a == "forgery":
        forbid(("subtype", req.subtype), ("tampered_message", req.tampered_message),
               ("fixed_basis", req.fixed_basis), ("intensity_pct", req.intensity_pct),
               ("replay_type", req.replay_type))
        if req.target_link not in (None, "both"):
            raise invalid_params("forgery targets both verifiers; target_link must be omitted or 'both'")
        cfg["targetLink"] = "both"

    elif a == "replay":
        if req.replay_type is None:
            raise invalid_params("replay requires replay_type ('used' | 'unknown')")
        forbid(("subtype", req.subtype), ("tampered_message", req.tampered_message),
               ("target_link", req.target_link), ("fixed_basis", req.fixed_basis),
               ("intensity_pct", req.intensity_pct))
        cfg["replayType"] = req.replay_type

    elif a == "tampering":
        if req.subtype not in TAMPERING_SUBTYPES:
            raise invalid_params("tampering requires subtype (fixed-basis | random-basis | "
                                 "partial | message-substitution | correction-bit)")
        if req.target_link is None:
            raise invalid_params("tampering requires target_link ('bob' | 'charlie' | 'both')")
        forbid(("replay_type", req.replay_type))
        cfg["subtype"] = req.subtype
        cfg["targetLink"] = req.target_link

        if req.subtype == "fixed-basis":
            if req.fixed_basis is None:
                raise invalid_params("fixed-basis tampering requires fixed_basis ('Z' | 'X' | 'Y')")
            forbid(("tampered_message", req.tampered_message), ("intensity_pct", req.intensity_pct))
            cfg["fixedBasis"] = req.fixed_basis

        elif req.subtype == "partial":
            forbid(("tampered_message", req.tampered_message), ("fixed_basis", req.fixed_basis))
            pct = req.intensity_pct if req.intensity_pct is not None else 25
            if pct not in VALID_INTENSITY:
                raise invalid_params("intensity_pct must be 5–100 in steps of 5")
            cfg["intensityPct"] = pct

        elif req.subtype == "message-substitution":
            forbid(("fixed_basis", req.fixed_basis), ("intensity_pct", req.intensity_pct))
            if req.tampered_message is None:
                raise invalid_params("message-substitution requires tampered_message")
            _check_message(req.tampered_message, "tampered_message")
            if req.tampered_message == req.message:
                raise invalid_params("tampered_message must differ from message")
            w1 = bch.message_word(req.message)
            w2 = bch.message_word(req.tampered_message)
            if bool(np.array_equal(w1, w2)):
                raise invalid_params(
                    "tampered_message hashes to the same 39-bit message word; "
                    "pick a different tampered_message",
                    detail="the two messages collide under the first 39 bits of sha256")
            cfg["tamperedMessage"] = req.tampered_message

        else:  # random-basis, correction-bit
            forbid(("tampered_message", req.tampered_message),
                   ("fixed_basis", req.fixed_basis), ("intensity_pct", req.intensity_pct))

    return cfg, seed


def validate_binomial(n: int, p_honest: float, p_cheat: float) -> None:
    if not (1 <= n <= 512):
        raise invalid_params(f"n must be in [1, 512], got {n}")
    for name, p in (("p_honest", p_honest), ("p_cheat", p_cheat)):
        if not (0.0 <= p <= 1.0):
            raise invalid_params(f"{name} must be in [0, 1], got {p}")
