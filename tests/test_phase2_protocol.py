"""Phase 2 gate — protocol + attack tests T7–T12 (REPORT §13).

Statistical sample sizes: the report specifies 200 seeds per scenario for the
oracle table. To keep the gate runnable in this environment the suite uses
SEEDS = 40 per scenario (and 80 for the partial verdict-rate checks). At 40
seeds the standard error of a mean rate is < 0.002, so the ±0.03 oracle
tolerance is tested with large margin. Recorded in BACKEND_STATE.md.
"""
from __future__ import annotations

import ast
import itertools
import pathlib

import numpy as np
import pytest

from app.engine import bch
from app.engine.protocol import execute, generate_keys, sign, distribute, verify

SEEDS = range(1000, 1040)          # 40 seeds
VERDICT_SEEDS = range(2000, 2080)  # 80 seeds for detection-rate checks


def cfg(**kw):
    base = dict(attack="no-attack", subtype=None, message="TRANSFER 1000",
                tamperedMessage=None, targetLink=None, fixedBasis=None,
                intensityPct=None, replayType=None)
    base.update(kw)
    return base


# ---- T7: BCH distance and encoding -------------------------------------------
def test_t7_min_weight_over_low_weight_messages():
    weights = []
    idxs = range(bch.K)
    for w in (1, 2, 3):
        for combo in itertools.combinations(idxs, w):
            word = np.zeros(bch.K, dtype=np.int8)
            word[list(combo)] = 1
            weights.append(int(bch.encode(word).sum()))
    assert len(weights) == 39 + 741 + 9139
    assert min(weights) >= 9, min(weights)


def test_t7_random_pairs_distance_and_syndrome():
    rng = np.random.default_rng(7)
    for _ in range(10_000):
        a = rng.integers(0, 2, bch.K).astype(np.int8)
        b = rng.integers(0, 2, bch.K).astype(np.int8)
        if np.array_equal(a, b):
            continue
        ca, cb = bch.encode(a), bch.encode(b)
        assert int((ca != cb).sum()) >= 9
    for _ in range(200):
        w = rng.integers(0, 2, bch.K).astype(np.int8)
        assert bch.is_codeword(bch.encode(w))
    # message pipeline is deterministic and 39 bits
    w1 = bch.message_word("TRANSFER 500")
    assert w1.shape == (39,) and np.array_equal(w1, bch.message_word("TRANSFER 500"))
    assert not np.array_equal(w1, bch.message_word("TRANSFER 5000"))


# ---- T8: honest run ------------------------------------------------------------
def test_t8_honest_statistics():
    means, rates = [], []
    for seed in range(300, 305):
        ev = execute(cfg(), seed)
        assert ev.fidelity.passed and abs(ev.fidelity.F - 0.97) < 0.025
        for v in ev.verifiers.values():
            assert v.verdict == "ACCEPTED" and v.failed == 0
            assert v.bags_wrong.max() < 12
            means.append(v.bags_wrong.mean())
            rates.extend(v.rates.values())
    assert abs(np.mean(means) - 2.56) < 0.5, np.mean(means)      # 128 * 0.02
    assert abs(np.mean(rates) - 0.02) < 0.005, np.mean(rates)


# ---- T9: the oracle table (rates EMERGE; asserted, never injected) -------------
def _mean_rates(config, seeds=SEEDS):
    acc = {"bob": {"Z": [], "X": [], "Y": []}, "charlie": {"Z": [], "X": [], "Y": []}}
    fails = {"bob": [], "charlie": []}
    for seed in seeds:
        ev = execute(config, seed)
        for who, v in ev.verifiers.items():
            for k in "ZXY":
                acc[who][k].append(v.rates[k])
            fails[who].append(v.failed)
    mean = {who: {k: float(np.mean(vals)) for k, vals in per.items()} for who, per in acc.items()}
    return mean, fails


def _close(got: dict, want: tuple, tol=0.03):
    for k, w in zip("ZXY", want):
        assert abs(got[k] - w) < tol, (got, want)


def test_t9_forgery():
    mean, fails = _mean_rates(cfg(attack="forgery", targetLink="both"))
    _close(mean["bob"], (0.5, 0.5, 0.5)); _close(mean["charlie"], (0.5, 0.5, 0.5))
    assert all(f == 63 for f in fails["bob"] + fails["charlie"])


def test_t9_fixed_basis():
    mean, fails = _mean_rates(cfg(attack="tampering", subtype="fixed-basis",
                                  targetLink="both", fixedBasis="Z"))
    _close(mean["bob"], (0.02, 0.5, 0.5)); _close(mean["charlie"], (0.02, 0.5, 0.5))
    assert min(fails["bob"]) > 40  # decisively rejected


def test_t9_random_basis_targeting():
    mean, fails = _mean_rates(cfg(attack="tampering", subtype="random-basis", targetLink="bob"))
    _close(mean["bob"], (0.34, 0.34, 0.34))
    _close(mean["charlie"], (0.02, 0.02, 0.02))
    assert all(f == 0 for f in fails["charlie"]) and min(fails["bob"]) > 40


def test_t9_partial_dilution():
    mean, _ = _mean_rates(cfg(attack="tampering", subtype="partial",
                              targetLink="both", intensityPct=25))
    want = 0.25 * 0.34 + 0.75 * 0.02  # 0.100
    for who in ("bob", "charlie"):
        for k in "ZXY":
            assert abs(mean[who][k] - want) < 0.03, (who, k, mean[who][k])


def test_t9_partial_verdict_rates():
    caught10 = caught5 = 0
    for seed in VERDICT_SEEDS:
        ev = execute(cfg(attack="tampering", subtype="partial", targetLink="both",
                         intensityPct=10), seed)
        caught10 += any(v.verdict == "REJECTED" for v in ev.verifiers.values())
        ev = execute(cfg(attack="tampering", subtype="partial", targetLink="both",
                         intensityPct=5), seed)
        caught5 += any(v.verdict == "REJECTED" for v in ev.verifiers.values())
    n = len(VERDICT_SEEDS)
    assert 0.75 <= caught10 / n <= 0.97, caught10 / n   # report: ~87–90 %
    assert 0.02 <= caught5 / n <= 0.30, caught5 / n     # report: ~13–14 %


def test_t9_correction_bit():
    mean, fails = _mean_rates(cfg(attack="tampering", subtype="correction-bit", targetLink="bob"))
    _close(mean["bob"], (0.98, 0.98, 0.02))
    _close(mean["charlie"], (0.02, 0.02, 0.02))
    assert all(f == 63 for f in fails["bob"]) and all(f == 0 for f in fails["charlie"])


def test_t9_impersonation_refused():
    Fs, sigmas = [], []
    for seed in SEEDS:
        ev = execute(cfg(attack="impersonation"), seed)
        assert not ev.fidelity.passed
        assert ev.verifiers == {}          # nothing measured
        assert ev.codeword is None         # no keys, no signature
        Fs.append(ev.fidelity.F); sigmas.append(ev.fidelity.sigma)
    assert abs(np.mean(Fs) - 0.5) < 0.02, np.mean(Fs)
    assert abs(np.mean(sigmas) - 0.024) < 0.01, np.mean(sigmas)


def test_t9_replay_measures_nothing():
    ev = execute(cfg(attack="replay", replayType="used"), 555)
    assert ev.fidelity.passed
    assert ev.verifiers == {"bob": None, "charlie": None}


# ---- T10: Eve's separation ------------------------------------------------------
def test_t10_attacks_imports_only_channel_layer():
    src = (pathlib.Path(__file__).parents[1] / "app" / "engine" / "attacks.py").read_text()
    mods = set()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, ast.Import):
            mods.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            mods.add(node.module or "")
    allowed = {"numpy", "numpy.random", "app.engine.quantum", "__future__"}
    assert mods <= allowed, mods


# ---- T11: message substitution — failed set == changed positions ------------------
def test_t11_failed_set_equals_bch_diff():
    pairs = [("TRANSFER 500", "TRANSFER 5000"), ("PAY ALICE 10", "PAY EVE 10"),
             ("SHIP 40 UNITS", "SHIP 400 UNITS")]
    for i, (m, mt) in enumerate(pairs):
        for seed in range(400 + 10 * i, 405 + 10 * i):
            ev = execute(cfg(attack="tampering", subtype="message-substitution",
                             targetLink="both", message=m, tamperedMessage=mt), seed)
            changed = set(ev.changed_positions)
            assert len(changed) >= 9  # BCH distance
            for v in ev.verifiers.values():
                failed = {int(j) for j in np.flatnonzero(v.bags_wrong >= 12)}
                assert failed == changed, (m, mt, seed, failed ^ changed)
                mean_changed = float(np.mean([v.bags_wrong[j] / 128 for j in changed]))
                assert abs(mean_changed - 0.5) < 0.04


# ---- T12: an old signature dies with the session --------------------------------
def test_t12_cross_session_signature_fails():
    m = "OLD PAYMENT"
    codeword = bch.codeword_for(m)
    rates = []
    for seed_a, seed_b in [(11, 12), (13, 14), (15, 16)]:
        basis_a, value_a = generate_keys(seed_a, "a")
        sig_basis, sig_value = sign(basis_a, value_a, codeword)   # session A's signature
        basis_b, value_b = generate_keys(seed_b, "a")             # session B's fresh material
        register, _ = distribute(seed_b, "a", basis_b, value_b)
        v = verify(seed_b, "a", register, codeword, sig_basis, sig_value)
        assert v.verdict == "REJECTED" and v.failed == 63
        rates.append(np.mean(list(v.rates.values())))
    assert abs(np.mean(rates) - 0.5) < 0.02, np.mean(rates)
