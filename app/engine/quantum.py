"""
Quantum core (REPORT §5) — batched state-vector simulation with NumPy.

A `StateBatch` holds N slots of a k-qubit register as a complex array of shape
(N, 2, ..., 2). All required operations are here: Bell pairs, 1-qubit unitaries,
CNOT, Hadamard, Paulis, projective measurement in Z/X/Y with Born rule and
collapse, exact depolarising noise, teleportation, Bell-correlation fidelity.

No-cloning enforcement:
  * one owner per handle; measuring a qubit marks it consumed — any further
    gate/measurement on that qubit raises `NoCloningError`;
  * `copy`, `deepcopy` and pickling of a state raise `NoCloningError`;
  * the public API never returns amplitudes, only measurement outcomes
    (tests may inspect the private `_amp` to verify physics; production
    callers never do — see test T5's grep).

Randomness comes only from the caller-supplied numpy Generator (REPORT §4).
"""
from __future__ import annotations

import numpy as np
from numpy.random import Generator


class NoCloningError(RuntimeError):
    """A quantum state was copied, or a consumed qubit was reused."""


# ---- fixed operators --------------------------------------------------------
I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Z = np.diag([1.0, -1.0]).astype(complex)
Y = 1j * X @ Z
H = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
PAULI = np.stack([I2, X, Y, Z])  # index 0..3 = I,X,Y,Z

# basis index 0 = Z, 1 = X, 2 = Y; value 0/1 — six eigenstates
_EIG = {
    0: np.array([[1, 0], [0, 1]], dtype=complex),
    1: np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2),
    2: np.array([[1, 1], [1j, -1j]], dtype=complex) / np.sqrt(2),
}
# _EIG[b][:, v] is the eigenstate |b, v>. TO_Z[b] maps that basis's eigenstates to |0>,|1>.
EIGENSTATES = {b: m.T.copy() for b, m in ((b, _EIG[b]) for b in (0, 1, 2))}  # EIGENSTATES[b][v] = vector
TO_Z = np.stack([_EIG[b].conj().T for b in (0, 1, 2)])
BASIS_NAME = ("Z", "X", "Y")


def eigenstate_batch(basis: np.ndarray, value: np.ndarray) -> np.ndarray:
    """(N,) basis indices + (N,) values -> (N, 2) eigenstate vectors."""
    table = np.stack([EIGENSTATES[0], EIGENSTATES[1], EIGENSTATES[2]])  # (3, 2, 2)
    return table[basis, value]


class StateBatch:
    """N slots of a k-qubit register. Qubit q lives on axis q + 1."""

    __slots__ = ("_amp", "_consumed", "_dead")

    def __init__(self, amp: np.ndarray):
        self._amp = np.ascontiguousarray(amp, dtype=complex)
        k = self._amp.ndim - 1
        if self._amp.shape[1:] != (2,) * k:
            raise ValueError("state must have shape (N, 2, ..., 2)")
        self._consumed: set[int] = set()
        self._dead = False

    # ---- no-cloning ---------------------------------------------------------
    def __copy__(self):
        raise NoCloningError("quantum states cannot be copied")

    def __deepcopy__(self, memo):
        raise NoCloningError("quantum states cannot be copied")

    def __reduce__(self):
        raise NoCloningError("quantum states cannot be pickled")

    def _live(self, *qubits: int) -> None:
        if self._dead:
            raise NoCloningError("state handle already consumed")
        for q in qubits:
            if q in self._consumed:
                raise NoCloningError(f"qubit {q} was already measured (no cloning)")

    # ---- inspection that does NOT expose amplitudes -------------------------
    @property
    def n(self) -> int:
        return self._amp.shape[0]

    @property
    def qubits(self) -> int:
        return self._amp.ndim - 1

    def norms(self) -> np.ndarray:
        flat = self._amp.reshape(self.n, -1)
        return np.sqrt((np.abs(flat) ** 2).sum(axis=1))

    # ---- gates ---------------------------------------------------------------
    def apply_1q(self, U: np.ndarray, qubit: int) -> None:
        """Apply a 1-qubit unitary — (2,2) global or (N,2,2) per-slot."""
        self._live(qubit)
        moved = np.moveaxis(self._amp, qubit + 1, 1)
        shape = moved.shape
        m = moved.reshape(self.n, 2, -1)
        out = np.einsum("ij,njk->nik", U, m) if U.ndim == 2 else np.einsum("nij,njk->nik", U, m)
        self._amp = np.moveaxis(out.reshape(shape), 1, qubit + 1)

    def hadamard(self, qubit: int) -> None:
        self.apply_1q(H, qubit)

    def cnot(self, control: int, target: int) -> None:
        self._live(control, target)
        moved = np.moveaxis(np.moveaxis(self._amp, control + 1, 1), target + 1, 2)
        out = moved.copy()
        out[:, 1, 0], out[:, 1, 1] = moved[:, 1, 1], moved[:, 1, 0]
        self._amp = np.moveaxis(np.moveaxis(out, 2, target + 1), 1, control + 1)

    def depolarise(self, qubit: int, q: float, rng: Generator) -> None:
        """Exact depolarising: with probability q apply a uniform random Pauli I/X/Y/Z."""
        self._live(qubit)
        hit = rng.random(self.n) < q
        pick = rng.integers(0, 4, self.n)
        pick = np.where(hit, pick, 0)  # I where the channel did not fire
        self.apply_1q(PAULI[pick], qubit)

    def pauli_correction(self, qubit: int, m1: np.ndarray, m2: np.ndarray) -> None:
        """Teleportation correction X^m2 Z^m1 per slot."""
        self._live(qubit)
        Zp = np.where(m1[:, None, None].astype(bool), Z, I2)
        Xp = np.where(m2[:, None, None].astype(bool), X, I2)
        self.apply_1q(np.einsum("nij,njk->nik", Xp, Zp), qubit)

    # ---- measurement ----------------------------------------------------------
    def measure(self, qubit: int, basis: np.ndarray | int, rng: Generator,
                terminal: bool = True, mask: np.ndarray | None = None) -> np.ndarray:
        """Projective measurement of `qubit` in Z/X/Y (per-slot basis indices or one
        index for all). Born rule with the supplied generator; the state collapses.

        terminal=True (the default) marks the qubit consumed — the verification
        measurement, after which the material cannot be reused (NoCloningError).
        terminal=False models a measurement in flight (Eve's intercept-resend):
        the state collapses to the measured eigenstate, which IS the qubit she
        resends — no copy ever exists. `mask` restricts the measurement to the
        masked slots (outcome -1 and untouched state elsewhere) — the partial
        attack. Returns outcomes (N,) in {0,1} (-1 where unmasked)."""
        self._live(qubit)
        if np.isscalar(basis):
            U = TO_Z[int(basis)]
        else:
            U = TO_Z[np.asarray(basis, dtype=int)]
        self.apply_1q(U, qubit)  # rotate the chosen basis onto Z

        moved = np.moveaxis(self._amp, qubit + 1, 1)
        p1 = (np.abs(moved[:, 1]) ** 2).reshape(self.n, -1).sum(axis=1)
        outcomes = (rng.random(self.n) < p1).astype(np.int8)

        idx = np.arange(self.n)
        kept = moved[idx, outcomes]
        norm = np.sqrt((np.abs(kept.reshape(self.n, -1)) ** 2).sum(axis=1))
        kept = kept / norm.reshape((self.n,) + (1,) * (kept.ndim - 1))
        collapsed = np.zeros_like(moved)
        collapsed[idx, outcomes] = kept
        if mask is not None:
            m = np.asarray(mask, dtype=bool)
            shape = (self.n,) + (1,) * (collapsed.ndim - 1)
            collapsed = np.where(m.reshape(shape), collapsed, moved)
            outcomes = np.where(m, outcomes, np.int8(-1))
        self._amp = np.moveaxis(collapsed, 1, qubit + 1)

        # rotate back so the remaining qubits stay in the computational frame
        Ud = np.conj(np.swapaxes(U, -1, -2))
        self.apply_1q(Ud, qubit)
        if terminal:
            self._consumed.add(qubit)
        return outcomes

    def take(self, indices: np.ndarray) -> "StateBatch":
        """Move the selected slots into a new handle and destroy the rest.
        This is a move, never a copy: the source handle dies — exactly the
        protocol's 'unopened bags are destroyed unmeasured'."""
        self._live()
        out = StateBatch(self._amp[np.asarray(indices, dtype=int)])
        out._consumed = set(self._consumed)
        self._amp = np.zeros((0,) + self._amp.shape[1:], dtype=complex)
        self._dead = True
        return out


def bell_pairs(n: int) -> StateBatch:
    """N copies of |Phi+> = (|00> + |11>)/sqrt(2)."""
    amp = np.zeros((n, 2, 2), dtype=complex)
    amp[:, 0, 0] = amp[:, 1, 1] = 1 / np.sqrt(2)
    return StateBatch(amp)


def attach_states(psi: np.ndarray, pair: StateBatch) -> StateBatch:
    """Tensor N single-qubit states (N,2) with N Bell pairs -> (N,2,2,2), consuming the pair handle."""
    pair._live()
    out = StateBatch(np.einsum("na,nbc->nabc", psi, pair._amp))
    pair._dead = True
    return out


def bsm(state: StateBatch, rng: Generator) -> tuple[np.ndarray, np.ndarray]:
    """Alice's Bell-state measurement on qubits (0, 1): CNOT(0->1), H(0), measure both in Z.
    Returns the two classical correction bits (m1 from psi, m2 from a)."""
    state.cnot(0, 1)
    state.hadamard(0)
    m1 = state.measure(0, 0, rng)
    m2 = state.measure(1, 0, rng)
    return m1.astype(np.int8), m2.astype(np.int8)


def teleport(psi: np.ndarray, rng: Generator, noise_q: float = 0.0,
             noise_rng: Generator | None = None) -> StateBatch:
    """Whole-pipeline teleportation of N states (N,2) over fresh Bell pairs.
    Used by tests and the fidelity of the design; protocol.py composes the staged
    version with channel hooks. Returns the receiver's register (qubit 2 live)."""
    st = attach_states(psi, bell_pairs(psi.shape[0]))
    if noise_q > 0:
        st.depolarise(2, noise_q, noise_rng or rng)
    m1, m2 = bsm(st, rng)
    st.pauli_correction(2, m1, m2)
    return st


def correlation_products(pairs: StateBatch, basis: int, rng: Generator) -> np.ndarray:
    """Measure both halves of N Bell pairs in the same basis; return per-pair ±1 products."""
    o0 = pairs.measure(0, basis, rng).astype(np.int64)
    o1 = pairs.measure(1, basis, rng).astype(np.int64)
    return (1 - 2 * o0) * (1 - 2 * o1)


def fidelity_from_correlations(exx: float, eyy: float, ezz: float) -> float:
    """F = (1 + <XX> - <YY> + <ZZ>) / 4."""
    return (1.0 + exx - eyy + ezz) / 4.0


# ------------------------------------------------------------------ channels
class QuantumChannel:
    """Eve's ONLY window on a quantum link (REPORT §5, D7): she may measure the
    flying qubit and thereby resend the collapsed eigenstate. She never sees
    amplitudes, owners, or Alice's descriptions."""

    def __init__(self, state: StateBatch, qubit: int, rng: Generator):
        self._state = state
        self._qubit = qubit
        self._rng = rng

    @property
    def n(self) -> int:
        return self._state.n

    def intercept_measure_resend(self, basis: np.ndarray | int,
                                 mask: np.ndarray | None = None) -> np.ndarray:
        """Measure the in-flight qubit in Eve's basis; the post-measurement
        eigenstate is what travels on. Returns her outcomes (she keeps them;
        they help her not at all against secret bases)."""
        return self._state.measure(self._qubit, basis, self._rng, terminal=False, mask=mask)


class ClassicalChannel:
    """Eve's window on the classical correction bits: read or rewrite."""

    def __init__(self, m1: np.ndarray, m2: np.ndarray):
        self.m1 = m1
        self.m2 = m2

    def tap(self) -> tuple[np.ndarray, np.ndarray]:
        return self.m1, self.m2

    def rewrite(self, m1: np.ndarray, m2: np.ndarray) -> None:
        self.m1 = m1
        self.m2 = m2
