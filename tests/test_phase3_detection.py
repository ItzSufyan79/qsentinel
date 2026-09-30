"""Phase 3 gate — detection tests T13–T17 (REPORT §13).

Sample sizes: T13 uses 12 seeds per scenario (report: full confusion matrix over
many seeds), T16 uses 150 + 150 seeds (report: 500 + 500). Standard errors keep
all asserted tolerances comfortably tested; recorded in BACKEND_STATE.md.
"""
from __future__ import annotations

import re
import pathlib

import numpy as np
import pytest
from sqlalchemy import text

from app.engine import detection as D
from app.engine import narrative as N
from app.engine.protocol import execute, fidelity_test

SEEDS = range(5000, 5012)


def cfg(**kw):
    base = dict(attack="no-attack", subtype=None, message="TRANSFER 1000",
                tamperedMessage=None, targetLink=None, fixedBasis=None,
                intensityPct=None, replayType=None)
    base.update(kw)
    return base


# ---- T13: classification confusion matrix (evidence only, never config) --------
CASES = [
    (cfg(), None, "no-attack"),
    (cfg(attack="forgery", targetLink="both"), None, "forgery"),
    (cfg(attack="impersonation"), None, "impersonation"),
    (cfg(attack="tampering", subtype="fixed-basis", targetLink="both", fixedBasis="Z"), None, "tampering-fixed-basis"),
    (cfg(attack="tampering", subtype="fixed-basis", targetLink="bob", fixedBasis="Y"), None, "tampering-fixed-basis"),
    (cfg(attack="tampering", subtype="random-basis", targetLink="bob"), None, "tampering-random-basis"),
    (cfg(attack="tampering", subtype="partial", targetLink="both", intensityPct=25), None, "tampering-partial"),
    (cfg(attack="tampering", subtype="partial", targetLink="charlie", intensityPct=60), None, "tampering-partial"),
    (cfg(attack="tampering", subtype="message-substitution", targetLink="both",
         message="TRANSFER 500", tamperedMessage="TRANSFER 5000"), None, "tampering-message-substitution"),
    (cfg(attack="tampering", subtype="correction-bit", targetLink="bob"), None, "tampering-correction-bit"),
]


@pytest.mark.parametrize("config,ledger,expect", CASES,
                         ids=[c[2] + "-" + str(i) for i, c in enumerate(CASES)])
def test_t13_classification(config, ledger, expect):
    for seed in SEEDS:
        ev = execute(config, seed)
        cls = D.classify(ev, ledger)
        assert cls.detected_key == expect, (seed, cls.detected_key)
        if expect not in ("no-attack",):
            assert cls.confidence > 0.85, (expect, cls.confidence)


def test_t13_replay_paths_and_split_targeting():
    ev = execute(cfg(attack="replay", replayType="used"), 5100)
    assert D.classify(ev, "REJECTED_USED").detected_key == "replay-used"
    assert D.classify(ev, "REJECTED_NOT_FOUND").detected_key == "replay-unknown"
    # split targeting: bob attacked, charlie clean -> primary is bob
    ev = execute(cfg(attack="tampering", subtype="random-basis", targetLink="bob"), 5101)
    cls = D.classify(ev, None)
    assert cls.primary == "bob" and cls.detected_key == "tampering-random-basis"
    ag = N.agreement(ev.verifiers["bob"].verdict, ev.verifiers["charlie"].verdict, False)
    assert ag["consistent"] is False and "Bob" in ag["reason"]


def test_t13_missed_partial_reads_no_attack():
    """A 5% partial run that stays under every threshold classifies no-attack (D11)."""
    seen_missed = False
    for seed in range(5200, 5230):
        ev = execute(cfg(attack="tampering", subtype="partial", targetLink="both",
                         intensityPct=5), seed)
        cls = D.classify(ev, None)
        rejected = any(v.verdict == "REJECTED" for v in ev.verifiers.values())
        if not rejected:
            seen_missed = True
            assert cls.detected_key == "no-attack" and cls.confidence == 0.99
        else:
            assert cls.detected_key == "tampering-partial"
    assert seen_missed  # at 5% most runs slip through


# ---- T14: severity worked examples ---------------------------------------------
def test_t14_severity_examples():
    assert D.severity("ACCEPTED", 0.99, 40, 9) == {"score": 0, "confidencePart": 0,
                                                   "deviationPart": 0, "categoryPart": 0}
    s = D.severity("REJECTED", 0.99, 0, 8)      # impersonation: gate stop, no bags
    assert (s["confidencePart"], s["deviationPart"], s["categoryPart"], s["score"]) == (10, 0, 8, 6)
    s = D.severity("REJECTED", 0.98, 75, 9)     # forgery
    assert (s["confidencePart"], s["deviationPart"], s["score"]) == (10, 10, 10)
    # floor(x + 0.5) differs from Python round(): 6.5 must become 7, not 6
    s = D.severity("REJECTED", 0.80, 6, 6)
    assert (s["confidencePart"], s["deviationPart"], s["categoryPart"]) == (8, 5, 6)
    assert s["score"] == 7 and round(0.4 * 8 + 0.3 * 5 + 0.3 * 6) == 6
    assert D.floor_half_up(2.5) == 3 and round(2.5) == 2


# ---- T15: binomial + detection curve ---------------------------------------------
def test_t15_pass_line_derivation():
    assert D.derive_pass_line(128, 0.02, 4e-5) == 12
    assert D.binomial_tail_geq(128, 0.02, 12) <= 4e-5
    assert D.binomial_tail_geq(128, 0.02, 11) > 4e-5


def test_t15_binomial_evidence_shape():
    be = D.binomial_evidence(128, 0.02, 0.5)
    assert be["passLine"] == 12 and len(be["x"]) == 129
    assert abs(sum(be["honest"]) - 1) < 1e-9 and abs(sum(be["cheater"]) - 1) < 1e-9
    assert 0 < be["falseRejection"] <= 4e-5
    assert be["falseAcceptance"] < 1e-20  # a blind guesser essentially never passes a bag


def test_t15_detection_curve_checkpoints():
    c = D.detection_curve(25)
    i5, i10, i15 = (c["intensities"].index(x) for x in (5, 10, 15))
    assert abs(c["signature"][i5] - 0.13) < 0.03, c["signature"][i5]   # exact formula gives 0.138
    assert abs(c["signature"][i10] - 0.87) < 0.03, c["signature"][i10]  # exact formula gives 0.895
    assert c["signature"][i15] > 0.99
    assert c["chosenIndex"] == c["intensities"].index(25)
    assert c["signatureAt"] == c["signature"][c["chosenIndex"]]


# ---- T16: fidelity gate over many seeds --------------------------------------------
def test_t16_fidelity_gate_separation():
    hF, iF, isig = [], [], []
    for seed in range(6000, 6150):
        h = fidelity_test(seed, impersonation=False)
        assert h.passed, (seed, h.F, h.sigma)
        hF.append(h.F)
        e = fidelity_test(seed, impersonation=True)
        assert not e.passed, (seed, e.F)
        iF.append(e.F); isig.append(e.sigma)
    assert abs(np.mean(hF) - 0.97) < 0.01, np.mean(hF)
    assert abs(np.mean(iF) - 0.50) < 0.015, np.mean(iF)
    assert abs(np.mean(isig) - 0.024) < 0.008, np.mean(isig)


# ---- T17: banned terms never emitted --------------------------------------------------
BANNED = re.compile(r"\b(block|collusion|arbitration|verifier-cross-check|classical-mac|malicious|compromised)\b",
                    re.IGNORECASE)


def test_t17_banned_terms_absent():
    root = pathlib.Path(__file__).parents[1] / "app"
    for f in [root / "engine" / "narrative.py", root / "engine" / "constants.py",
              root / "engine" / "detection.py", root / "api" / "schemas.py"]:
        hits = BANNED.findall(f.read_text())
        assert not hits, (f.name, hits)
    # catalog text (root cause, mitigation, story, labels) — everything the UI shows
    from app.db.db import SessionLocal
    with SessionLocal() as s:
        rows = s.execute(text("SELECT attack_key, label, classification, root_cause, mitigations, "
                              "story, injected_between, caught_by FROM attack_catalog")).all()
    assert len(rows) == 10
    for row in rows:
        blob = " ".join(str(x) for x in row)
        assert not BANNED.findall(blob), (row[0], BANNED.findall(blob))
