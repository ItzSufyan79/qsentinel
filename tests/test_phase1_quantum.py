"""Phase 1 gate — physics tests T1–T6 (REPORT §13)."""
from __future__ import annotations

import copy
import pathlib
import pickle
import re

import numpy as np
import pytest

from app.engine import quantum as Q
from app.engine.rng import stream

RNG = lambda name="t", seed=7: stream(seed, name)  # noqa: E731


def random_states(n: int, rng) -> np.ndarray:
    v = rng.normal(size=(n, 2)) + 1j * rng.normal(size=(n, 2))
    return v / np.linalg.norm(v, axis=1)[:, None]


# ---- T1: zero-noise teleportation reproduces psi ----------------------------
def test_t1_teleport_eigenstates_and_random():
    rng = RNG("t1")
    basis = np.repeat(np.arange(3), 2)
    value = np.tile(np.arange(2), 3)
    psi = Q.eigenstate_batch(basis, value)
    for _ in range(3):  # different correction-bit draws
        out = Q.teleport(psi.copy(), stream(7, f"t1-{_}"))
        b = np.moveaxis(out._amp, 3, 1)[:, :, 0, 0] * 0  # placeholder no-op
        recon = _extract_qubit2(out)
        fid = np.abs(np.einsum("ni,ni->n", psi.conj(), recon)) ** 2
        assert np.all(np.abs(fid - 1) < 1e-12)

    psi = random_states(1000, rng)
    out = Q.teleport(psi, stream(7, "t1-rand"))
    recon = _extract_qubit2(out)
    fid = np.abs(np.einsum("ni,ni->n", psi.conj(), recon)) ** 2
    assert np.all(np.abs(fid - 1) < 1e-12)


def _extract_qubit2(st: Q.StateBatch) -> np.ndarray:
    """After BSM the first two qubits are collapsed to definite values; slice them out.
    Test-only physics check via the private amplitude array."""
    amp = st._amp  # (N,2,2,2)
    n = amp.shape[0]
    flat = amp.reshape(n, 4, 2)
    idx = np.argmax((np.abs(flat) ** 2).sum(axis=2), axis=1)
    vec = flat[np.arange(n), idx]
    norm = np.linalg.norm(vec, axis=1)
    return vec / norm[:, None]


# ---- T2: norms and Born statistics ------------------------------------------
def test_t2_norm_after_gates_and_measurement():
    rng = RNG("t2")
    psi = random_states(500, rng)
    st = Q.attach_states(psi, Q.bell_pairs(500))
    for op in range(4):
        st.cnot(0, 1); assert np.allclose(st.norms(), 1, atol=1e-12)
        st.hadamard(0); assert np.allclose(st.norms(), 1, atol=1e-12)
        st.apply_1q(Q.Y, 2); assert np.allclose(st.norms(), 1, atol=1e-12)
        st.depolarise(2, 0.3, rng); assert np.allclose(st.norms(), 1, atol=1e-12)
    st.measure(0, 0, rng)
    assert np.allclose(st.norms(), 1, atol=1e-12)


def test_t2_born_rule_plus_in_z():
    n = 100_000
    plus = Q.eigenstate_batch(np.full(n, 1), np.zeros(n, dtype=int))  # |+>
    st = Q.StateBatch(plus)
    out = st.measure(0, 0, RNG("t2b"))
    p = out.mean()
    sigma = 0.5 / np.sqrt(n)
    assert abs(p - 0.5) < 4 * sigma, p


# ---- T3: Bell correlations exact for noiseless |Phi+> ------------------------
def test_t3_bell_correlations_exact():
    def exact_corr(basis):
        pair = Q.bell_pairs(1)
        B = {0: Q.Z, 1: Q.X, 2: Q.Y}[basis]
        op = np.kron(B, B)
        v = pair._amp.reshape(1, 4)[0]
        return float(np.real(v.conj() @ op @ v))
    assert exact_corr(0) == pytest.approx(1.0, abs=1e-12)   # ZZ
    assert exact_corr(1) == pytest.approx(1.0, abs=1e-12)   # XX
    assert exact_corr(2) == pytest.approx(-1.0, abs=1e-12)  # YY
    # and the sampled machinery agrees exactly (deterministic outcomes here)
    for basis, want in ((0, 1), (1, 1), (2, -1)):
        prods = Q.correlation_products(Q.bell_pairs(2000), basis, RNG(f"t3-{basis}"))
        assert np.all(prods == want)


# ---- T4: fidelity formula ----------------------------------------------------
def _sampled_F(noise_q: float, n=6000, seed_name="t4") -> tuple[float, float]:
    ex = {}
    var = {}
    for basis in (1, 2, 0):  # XX, YY, ZZ
        pairs = Q.bell_pairs(n)
        pairs.depolarise(1, noise_q, RNG(seed_name + "n" + str(basis)))
        prods = Q.correlation_products(pairs, basis, RNG(seed_name + str(basis)))
        ex[basis] = prods.mean()
        var[basis] = prods.var(ddof=1) / n
    F = Q.fidelity_from_correlations(ex[1], ex[2], ex[0])
    sigma = np.sqrt(var[1] + var[2] + var[0]) / 4
    return F, sigma


def test_t4_fidelity_values():
    F, _ = _sampled_F(0.0)
    assert F == pytest.approx(1.0, abs=1e-12)
    F, s = _sampled_F(0.04)
    assert abs(F - 0.97) < max(0.01, 5 * s), (F, s)
    F, s = _sampled_F(1.0)  # maximally mixed
    assert abs(F - 0.25) < max(0.02, 5 * s), (F, s)


def test_t4_product_states_below_half():
    rng = RNG("t4p")
    for _ in range(200):
        a = random_states(1, rng)[0]
        b = random_states(1, rng)[0]
        v = np.kron(a, b)
        F = 0.25 * (1
                    + np.real(v.conj() @ np.kron(Q.X, Q.X) @ v)
                    - np.real(v.conj() @ np.kron(Q.Y, Q.Y) @ v)
                    + np.real(v.conj() @ np.kron(Q.Z, Q.Z) @ v))
        assert F <= 0.5 + 1e-9, F


# ---- T5: no-cloning ------------------------------------------------------------
def test_t5_consumed_reuse_raises():
    st = Q.bell_pairs(10)
    st.measure(0, 0, RNG("t5"))
    with pytest.raises(Q.NoCloningError):
        st.measure(0, 0, RNG("t5"))
    with pytest.raises(Q.NoCloningError):
        st.hadamard(0)
    st.measure(1, 1, RNG("t5"))  # the other qubit is still live until measured

    psi = Q.eigenstate_batch(np.zeros(3, int), np.zeros(3, int))
    pair = Q.bell_pairs(3)
    Q.attach_states(psi, pair)
    with pytest.raises(Q.NoCloningError):
        Q.attach_states(psi, pair)  # pair handle consumed by attach


def test_t5_copy_paths_raise():
    st = Q.bell_pairs(2)
    with pytest.raises(Q.NoCloningError):
        copy.copy(st)
    with pytest.raises(Q.NoCloningError):
        copy.deepcopy(st)
    with pytest.raises(Q.NoCloningError):
        pickle.dumps(st)


def test_t5_no_copy_calls_in_engine():
    """Static check: no code path in the engine copies a quantum state (strings/comments skipped)."""
    import io
    import tokenize
    eng = pathlib.Path(__file__).parents[1] / "app" / "engine"
    pattern = re.compile(r"\b(deepcopy|clone|pickle)\b")
    for f in eng.glob("*.py"):
        code_tokens = [
            t.string for t in tokenize.generate_tokens(io.StringIO(f.read_text()).readline)
            if t.type == tokenize.NAME
        ]
        hits = [t for t in code_tokens if pattern.fullmatch(t)]
        assert not hits, f"{f.name}: copy-capable names in code: {hits}"


# ---- T6: determinism ------------------------------------------------------------
def test_t6_same_seed_identical_and_streams_independent():
    a1 = stream(123, "verify-a").integers(0, 2, 5000)
    a2 = stream(123, "verify-a").integers(0, 2, 5000)
    b = stream(123, "verify-b").integers(0, 2, 5000)
    c = stream(124, "verify-a").integers(0, 2, 5000)
    assert np.array_equal(a1, a2)
    assert not np.array_equal(a1, b)
    assert not np.array_equal(a1, c)
    # drawing extra numbers from one stream never shifts another
    s1 = stream(9, "noise-a"); _ = s1.random(10_000)
    s2 = stream(9, "noise-b")
    b1 = s2.integers(0, 4, 100)
    b2 = stream(9, "noise-b").integers(0, 4, 100)
    assert np.array_equal(b1, b2)

    # measurement outcomes deterministic per seed
    psi = Q.eigenstate_batch(np.ones(100, int), np.zeros(100, int))
    o1 = Q.StateBatch(psi.copy()).measure(0, 0, stream(5, "m"))
    o2 = Q.StateBatch(psi.copy()).measure(0, 0, stream(5, "m"))
    assert np.array_equal(o1, o2)
