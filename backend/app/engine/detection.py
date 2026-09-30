"""
Detection layer (REPORT §7): fingerprint matching, ordered classification,
confidence, severity, binomial evidence, partial-attack detection curve.

Everything here reads MEASURED evidence only — never the run config
(rule 7.4: "classification never reads the config").
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

from app.engine import bch
from app.engine.constants import (
    BAGS, FINGERPRINT_LIBRARY, HONEST_ERROR_RATE, P_RAND, PASS_LINE, SLOTS_PER_BAG,
)
from app.engine.protocol import EngineEvidence, VerifierEvidence


def floor_half_up(x: float) -> int:
    """floor(x + 0.5) — JavaScript-style rounding, NEVER Python round() (§7.5)."""
    return int(math.floor(x + 0.5))


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


# ------------------------------------------------------------------ fingerprint
def _sorted_desc(triple) -> np.ndarray:
    return np.sort(np.asarray(triple, dtype=float))[::-1]


def _distance(rates_triple, profile_triple) -> float:
    """Euclidean distance between descending-sorted triples (§7.2)."""
    return float(np.linalg.norm(_sorted_desc(rates_triple) - _sorted_desc(profile_triple)))


@dataclass
class Fingerprint:
    best: str
    best_label: str
    distance: float
    runner_up: str
    runner_up_label: str
    runner_up_distance: float
    library: list[dict]


def fingerprint(rates: dict[str, float]) -> Fingerprint:
    triple = (rates["Z"], rates["X"], rates["Y"])
    entries = []
    for pat in FINGERPRINT_LIBRARY:
        entries.append({
            "id": pat["id"],
            "label": pat["label"],
            "distance": round(_distance(triple, pat["profile"]), 6),
            "profile": [round(float(p), 6) for p in pat["profile"]],
        })
    order = sorted(entries, key=lambda e: e["distance"])
    best, runner = order[0], order[1]
    return Fingerprint(
        best=best["id"], best_label=best["label"], distance=best["distance"],
        runner_up=runner["id"], runner_up_label=runner["label"],
        runner_up_distance=runner["distance"], library=entries,
    )


# ------------------------------------------------------------------ classification
@dataclass
class Classification:
    detected_key: str
    confidence: float
    primary: Optional[str]           # verifier whose evidence drove the call
    fingerprint: Optional[Fingerprint]
    secondary_key: Optional[str]     # when both rejected and classes differ
    p_hat: Optional[float]           # partial dilution estimate


def _classify_verifier(v: VerifierEvidence) -> tuple[str, float, Optional[float]]:
    """Rules 4a–4f on one rejecting verifier. Returns (key, confidence, p_hat)."""
    triple = (v.rates["Z"], v.rates["X"], v.rates["Y"])
    failed_mask = v.bags_wrong >= PASS_LINE
    failed_idx = np.flatnonzero(failed_mask)
    passed_idx = np.flatnonzero(~failed_mask)
    p_mean = float(v.bags_wrong[passed_idx].sum() / (len(passed_idx) * SLOTS_PER_BAG)) if len(passed_idx) else 0.0

    # a) forgery: overall rates look like blind guessing and passed bags (if any) are hot too
    d_guess = _distance(triple, (0.5, 0.5, 0.5))
    if d_guess < 0.1 and (len(passed_idx) == 0 or p_mean >= 0.3):
        return "forgery", clamp01(1 - d_guess), None

    # b) message substitution: failed set is the difference of two codewords
    if 9 <= len(failed_idx) <= 62 and p_mean < 0.05:
        indicator = np.zeros(BAGS, dtype=np.int8)
        indicator[failed_idx] = 1
        if bch.is_codeword(indicator):
            failed_rates = _rates_over_bags(v, failed_idx)
            d = _distance(failed_rates, (0.5, 0.5, 0.5))
            return "tampering-message-substitution", clamp01(1 - d), None

    fp = fingerprint(v.rates)
    # c) correction-bit, d) fixed-basis
    if fp.best == "correction" and fp.distance < 0.1:
        return "tampering-correction-bit", clamp01(1 - fp.distance), None
    if fp.best == "fixed" and fp.distance < 0.1:
        return "tampering-fixed-basis", clamp01(1 - fp.distance), None

    # e) balanced rates: random vs partial via dilution estimate
    tri = np.asarray(triple)
    if float(tri.max() - tri.min()) < 0.06:
        mean = float(tri.mean())
        p_hat = clamp01((mean - HONEST_ERROR_RATE) / (P_RAND - HONEST_ERROR_RATE))
        if p_hat >= 0.9:
            d = _distance(triple, (P_RAND,) * 3)
            return "tampering-random-basis", clamp01(1 - d), p_hat
        diluted = p_hat * P_RAND + (1 - p_hat) * HONEST_ERROR_RATE
        d = _distance(triple, (diluted,) * 3)
        return "tampering-partial", clamp01(1 - d), p_hat

    # f) nothing fits
    return "unclassified", clamp01(1 - fp.distance), None


def _rates_over_bags(v: VerifierEvidence, bags: np.ndarray) -> tuple[float, float, float]:
    """Per-basis error rates restricted to the given bag indices."""
    out = []
    wrong = v.wrong[bags]
    basis = v.announced_basis[bags]
    for b in range(3):
        sel = basis == b
        n = int(sel.sum())
        out.append(float(wrong[sel].sum() / n) if n else 0.0)
    return tuple(out)  # type: ignore[return-value]


def classify(ev: EngineEvidence, ledger_outcome: Optional[str]) -> Classification:
    """Ordered rules of §7.4 — first match wins; evidence only."""
    # 1. fidelity gate
    if not ev.fidelity.passed:
        return Classification("impersonation", 0.99, None, None, None, None)
    # 2. ledger gate
    if ledger_outcome == "REJECTED_USED":
        return Classification("replay-used", 0.99, None, None, None, None)
    if ledger_outcome == "REJECTED_NOT_FOUND":
        return Classification("replay-unknown", 0.99, None, None, None, None)

    bob, charlie = ev.verifiers.get("bob"), ev.verifiers.get("charlie")
    # 3. both accepted
    if bob.verdict == "ACCEPTED" and charlie.verdict == "ACCEPTED":
        primary = "bob" if bob.failed >= charlie.failed else "charlie"
        return Classification("no-attack", 0.99, primary,
                              fingerprint(ev.verifiers[primary].rates), None, None)

    # 4. primary = rejecting verifier with more failed bags (tie -> bob)
    rejecting = [(who, v) for who, v in (("bob", bob), ("charlie", charlie)) if v.verdict == "REJECTED"]
    primary_name, primary_v = max(rejecting, key=lambda t: (t[1].failed, t[0] == "bob"))
    key, conf, p_hat = _classify_verifier(primary_v)

    secondary_key = None
    if len(rejecting) == 2:
        other = [t for t in rejecting if t[0] != primary_name][0][1]
        k2, _, _ = _classify_verifier(other)
        if k2 != key:
            secondary_key = k2
    return Classification(key, round(conf, 4), primary_name,
                          fingerprint(primary_v.rates), secondary_key, p_hat)


# ------------------------------------------------------------------ severity
def severity(verdict: str, confidence: float, max_wrong: int, category_part: int) -> dict:
    """§7.5 — parts and score only when REJECTED, else all zeros."""
    if verdict != "REJECTED":
        return {"score": 0, "confidencePart": 0, "deviationPart": 0, "categoryPart": 0}
    c = min(10, floor_half_up(9 + (confidence - 0.9) * 10))
    d = min(10, floor_half_up(max_wrong / 12 * 10))
    k = int(category_part)
    score = max(1, min(10, floor_half_up(0.4 * c + 0.3 * d + 0.3 * k)))
    return {"score": score, "confidencePart": c, "deviationPart": d, "categoryPart": k}


# ------------------------------------------------------------------ binomial
def binomial_pmf(n: int, p: float, k: np.ndarray) -> np.ndarray:
    """Stable PMF via lgamma (§7.6)."""
    k = np.asarray(k, dtype=float)
    lg = np.vectorize(math.lgamma)
    logp = (math.lgamma(n + 1) - lg(k + 1) - lg(n - k + 1)
            + k * math.log(p) + (n - k) * math.log1p(-p))
    return np.exp(logp)


def binomial_tail_geq(n: int, p: float, t: int) -> float:
    """P(X >= t)."""
    if t <= 0:
        return 1.0
    if t > n:
        return 0.0
    k = np.arange(t, n + 1)
    return float(np.clip(binomial_pmf(n, p, k).sum(), 0.0, 1.0))


def derive_pass_line(n: int = SLOTS_PER_BAG, p: float = HONEST_ERROR_RATE,
                     tail: float = 4e-5) -> int:
    """Smallest t with P(X >= t | p) <= tail (gives 12 at n=128, p=0.02)."""
    for t in range(n + 1):
        if binomial_tail_geq(n, p, t) <= tail:
            return t
    return n + 1


def binomial_evidence(n: int, p_honest: float, p_cheat: float) -> dict:
    """The /api/binomial payload and the bagDistribution numbers."""
    t = derive_pass_line(n, p_honest)
    x = list(range(n + 1))
    honest = binomial_pmf(n, p_honest, np.arange(n + 1))
    cheat = binomial_pmf(n, p_cheat, np.arange(n + 1))
    return {
        "n": n, "pHonest": p_honest, "pCheat": p_cheat, "passLine": t,
        "x": x, "honest": [float(v) for v in honest], "cheater": [float(v) for v in cheat],
        "falseRejection": float(np.clip(binomial_tail_geq(n, p_honest, t), 0, 1)),
        "falseAcceptance": float(np.clip(1 - binomial_tail_geq(n, p_cheat, t), 0, 1)),
    }


def bag_distribution(v: Optional[VerifierEvidence]) -> Optional[dict]:
    """§7.6: pCheat = observed mean error over the primary verifier's failed
    bags; blind-guess 0.5 if none failed. None when nothing measured."""
    if v is None:
        return None
    failed_idx = np.flatnonzero(v.bags_wrong >= PASS_LINE)
    if len(failed_idx):
        p_cheat = float(v.bags_wrong[failed_idx].mean() / SLOTS_PER_BAG)
    else:
        p_cheat = 0.5
    return {
        "n": SLOTS_PER_BAG, "passLine": PASS_LINE, "pHonest": HONEST_ERROR_RATE,
        "pCheat": round(p_cheat, 4),
        "falseRejection": binomial_tail_geq(SLOTS_PER_BAG, HONEST_ERROR_RATE, PASS_LINE),
        "falseAcceptance": float(np.clip(1 - binomial_tail_geq(SLOTS_PER_BAG, p_cheat, PASS_LINE), 0, 1)),
    }


# ------------------------------------------------------------------ detection curve
def detection_curve(chosen_pct: Optional[int]) -> dict:
    """§7.7 — partial-attack detection probabilities at 5..100 % (step 5)."""
    intensities = list(range(5, 101, 5))
    per_bag, signature = [], []
    for i in intensities:
        p = (i / 100) * P_RAND + (1 - i / 100) * HONEST_ERROR_RATE
        pb = binomial_tail_geq(SLOTS_PER_BAG, p, PASS_LINE)
        per_bag.append(pb)
        signature.append(1 - (1 - pb) ** BAGS)
    idx = intensities.index(chosen_pct) if chosen_pct in intensities else 0
    return {
        "intensities": intensities,
        "perBag": [float(v) for v in per_bag],
        "signature": [float(v) for v in signature],
        "chosenIndex": idx,
        "perBagAt": float(per_bag[idx]),
        "signatureAt": float(signature[idx]),
    }
