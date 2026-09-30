"""
Reference physics check for QSentinel — NOT the production engine.

A compact, vectorised state-vector simulation of one slot's life:
    Alice's state psi (a Z/X/Y eigenstate)  --teleported-->  verifier  --measured in the signed basis-->  wrong?

Qubit order in the 8-dimensional state: 0 = psi (Alice), 1 = a (Alice's half of the Bell pair), 2 = b (verifier's half).
It demonstrates, with real linear algebra, the numbers the production engine must reproduce
WITHOUT ever being told them (REPORT §6 oracle table). Run:  python reference_teleport_sim.py

Emergent results (60,000 slots, seed 7):
    honest              Z .019  X .019  Y .019
    random-basis        Z .341  X .347  Y .335
    fixed-basis Z       Z .018  X .499  Y .499     (X, Y symmetric)
    partial 25%         Z .101  X .097  Y .100
    correction-bit      Z .980  X .980  Y .022
Use it as the physics oracle for the production engine's tests, not as its implementation.
"""
from __future__ import annotations

import numpy as np

rng = np.random.default_rng(7)

I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Z = np.diag([1, -1]).astype(complex)
Y = 1j * X @ Z
H = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
PAULI = [I2, X, Y, Z]

# eigenstates, basis index 0 = Z, 1 = X, 2 = Y ; value 0 / 1
EIG = {
    0: [np.array([1, 0], complex), np.array([0, 1], complex)],
    1: [np.array([1, 1], complex) / np.sqrt(2), np.array([1, -1], complex) / np.sqrt(2)],
    2: [np.array([1, 1j], complex) / np.sqrt(2), np.array([1, -1j], complex) / np.sqrt(2)],
}


def apply(st: np.ndarray, U: np.ndarray, q: int) -> np.ndarray:
    """Apply a 1-qubit unitary (2x2, or per-slot Nx2x2) to qubit q of every slot's state (N,2,2,2)."""
    moved = np.moveaxis(st, q + 1, 1)
    out = np.einsum("ij,njab->niab", U, moved) if U.ndim == 2 else np.einsum("nij,njab->niab", U, moved)
    return np.moveaxis(out, 1, q + 1)


def to_z(basis: np.ndarray) -> np.ndarray:
    """Per-slot unitary sending the chosen basis's eigenstates to |0>,|1>."""
    return np.stack([np.stack(EIG[int(b)], 1).conj().T for b in basis])


def measure(st: np.ndarray, q: int, U: np.ndarray):
    """Projective measurement of qubit q in the basis encoded by U (Born rule, state collapses)."""
    st = apply(st, U, q)
    m = np.moveaxis(st, q + 1, 1)
    p1 = (np.abs(m[:, 1]) ** 2).reshape(len(m), -1).sum(1)
    out = (rng.random(len(m)) < p1).astype(int)
    idx = np.arange(len(m))
    keep = m[idx, out]
    keep = keep / np.linalg.norm(keep.reshape(len(m), -1), axis=1)[:, None, None]
    new = np.zeros_like(m)
    new[idx, out] = keep
    st = np.moveaxis(new, 1, q + 1)
    return out, apply(st, np.conj(np.swapaxes(U, -1, -2)), q)  # collapsed state, back in the original frame


def run(n: int, attack: str | None = None, fixed: int | None = None, frac: float = 1.0, q: float = 0.04, corr: bool = False):
    basis = rng.integers(0, 3, n)  # Alice's secret random basis per slot
    val = rng.integers(0, 2, n)  # Alice's secret random value per slot
    psi = np.stack([EIG[int(b)][int(v)] for b, v in zip(basis, val)])

    bell = np.zeros((2, 2), complex)
    bell[0, 0] = bell[1, 1] = 1 / np.sqrt(2)  # |Phi+>
    st = np.einsum("na,bc->nabc", psi, bell)

    # honest noise on the quantum link: depolarising with prob q  ==  random Pauli with prob q (exact)
    err = rng.random(n) < q
    pick = rng.integers(0, 4, n)
    st = apply(st, np.stack([PAULI[k] if e else I2 for k, e in zip(pick, err)]), 2)

    # Eve: intercept-resend on the verifier's Bell half (measure -> collapses the partner too -> resend eigenstate)
    if attack in ("fixed", "random"):
        hit = rng.random(n) < frac
        eve_basis = np.full(n, fixed) if attack == "fixed" else rng.integers(0, 3, n)
        _, collapsed = measure(st, 2, to_z(eve_basis))
        st = np.where(hit[:, None, None, None], collapsed, st)

    # Alice's Bell-state measurement on (psi, a): CNOT(psi->a), H(psi), measure both -> two classical bits
    s2 = st.copy()
    s2[:, 1, :, :] = st[:, 1, ::-1, :]
    st = apply(s2, H, 0)
    eye = np.broadcast_to(I2, (n, 2, 2)).copy()
    m1, st = measure(st, 0, eye)
    m2, st = measure(st, 1, eye)
    if corr:  # Eve inverts both classical bits on the way to the verifier
        m1, m2 = 1 - m1, 1 - m2

    # verifier applies X^m2 Z^m1 to its half, then measures it in the basis the signature announces
    fix = np.stack([np.linalg.matrix_power(X, int(a)) @ np.linalg.matrix_power(Z, int(b)) for a, b in zip(m2, m1)])
    st = apply(st, fix, 2)
    out, _ = measure(st, 2, to_z(basis))
    return basis, out != val


def rates(n: int, **kw):
    basis, wrong = run(n, **kw)
    return [round(float(wrong[basis == i].mean()), 3) for i in range(3)]


if __name__ == "__main__":
    N = 60000
    print("honest          ", rates(N))
    print("random-basis    ", rates(N, attack="random"))
    for f, name in ((0, "Z"), (1, "X"), (2, "Y")):
        print(f"fixed-basis {name}   ", rates(N, attack="fixed", fixed=f))
    print("partial 25%     ", rates(N, attack="random", frac=0.25))
    print("correction-bit  ", rates(N, corr=True))
