"""
Eve's operations (REPORT §6.2, D7). Every attack is an operation on qubits,
classical bits, messages or signatures — NEVER on measurement outcomes, and
never with access to Alice's secret descriptions.

Import rule (tested by T10): this module imports only numpy and the quantum
channel layer. It cannot see protocol's secret key structures.
"""
from __future__ import annotations

import numpy as np
from numpy.random import Generator

from app.engine.quantum import ClassicalChannel, QuantumChannel, eigenstate_batch


def forged_signature(rng: Generator, positions: int, slots: int) -> tuple[np.ndarray, np.ndarray]:
    """Forgery: Eve fabricates a whole signature packet — (basis, value) guessed
    uniformly at random for every slot of every position. She has no information
    about Alice's private material, so guessing is her best strategy."""
    basis = rng.integers(0, 3, (positions, slots), dtype=np.int8)
    value = rng.integers(0, 2, (positions, slots), dtype=np.int8)
    return basis, value


def intercept_resend(channel: QuantumChannel, rng: Generator, *,
                     mode: str, fixed_basis: int | None = None,
                     mask: np.ndarray | None = None) -> None:
    """Intercept-resend on the flying Bell half. `mode` 'fixed' measures every
    slot in one basis; 'random' guesses a basis per slot. `mask` limits her to
    a subset of slots (partial / stealth). The collapse IS the disturbance."""
    if mode == "fixed":
        if fixed_basis is None:
            raise ValueError("fixed-basis interception needs a basis")
        basis: np.ndarray | int = int(fixed_basis)
    elif mode == "random":
        basis = rng.integers(0, 3, channel.n, dtype=np.int8)
    else:
        raise ValueError(f"unknown interception mode {mode!r}")
    channel.intercept_measure_resend(basis, mask=mask)


def partial_slot_mask(select_rng: Generator, slots_per_bag: int, k: int,
                      flat_size: int) -> tuple[np.ndarray, np.ndarray]:
    """Partial attack slot choice: exactly k slots per bag, chosen uniformly
    without replacement, the SAME slot indices for every bag (REPORT §6.2)."""
    chosen = np.sort(select_rng.choice(slots_per_bag, size=k, replace=False))
    slot_of = np.arange(flat_size) % slots_per_bag
    return np.isin(slot_of, chosen), chosen


def flip_correction_bits(channel: ClassicalChannel) -> None:
    """Correction-bit tampering: Eve inverts BOTH classical bits (m1, m2) of
    every slot on the target link."""
    m1, m2 = channel.tap()
    channel.rewrite(1 - m1, 1 - m2)


def separable_bell_resource(rng: Generator, n: int) -> np.ndarray:
    """Impersonation (D8): Eve cannot make entanglement, so she plays the
    optimal separable strategy at the fidelity test — per pair she picks a
    random basis and sends two eigenstates correlated the way |Phi+> would be
    (equal in Z and X, opposite in Y). Perfect when the test happens to
    measure her basis (1/3 of the time), uncorrelated otherwise: E[F] = 0.5.
    Returns (n, 2, 2) product-state amplitudes — a real quantum state."""
    e = rng.integers(0, 3, n)
    v = rng.integers(0, 2, n)
    partner = np.where(e == 2, 1 - v, v)
    q0 = eigenstate_batch(e, v)
    q1 = eigenstate_batch(e, partner)
    return np.einsum("na,nb->nab", q0, q1)
