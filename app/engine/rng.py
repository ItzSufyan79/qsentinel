"""Randomness and determinism (REPORT §4).

`stream(seed, name)` — independent named streams so adding a draw in one place
never shifts another. Never the global RNG, never wall-clock, never `random`.
Session keys and unseeded seeds use `secrets` (see api layer / db kit).
"""
from __future__ import annotations

import hashlib

from numpy.random import PCG64, Generator, SeedSequence


def stream(seed: int, name: str) -> Generator:
    digest = hashlib.sha256(f"{seed}:{name}".encode()).digest()[:16]
    return Generator(PCG64(SeedSequence(int.from_bytes(digest, "big"))))
