"""
Pipeline (REPORT §9, §10.4): run the physics once, sequence the exact event/log
stream on the deterministic logical clock (mock `buildLifecycle` structure),
apply the two gates (fidelity, ledger), classify from evidence, and freeze
everything into one RunRecord. The API layer only ever replays this record.
"""
from __future__ import annotations

import time
from typing import Any, Optional, Protocol

import numpy as np

from app.engine import bch, detection, narrative
from app.engine import protocol as P
from app.engine.constants import (
    BAGS, ENGINE_VERSION, FIDELITY_PAIRS_PER_BASIS, LINK_NOISE_Q,
    PASS_LINE, SLOTS_PER_BAG, SYSTEM_PARAMS,
)
from app.engine.records import RunRecord


class LedgerPort(Protocol):
    """The pipeline's only view of the session ledger (kit-backed in prod)."""

    def admit(self, session_id: str) -> None: ...
    def refuse(self, session_id: str) -> None: ...
    def lookup(self, run_session_id: str, presented_id: str) -> dict: ...
    def victim(self, exclude: str) -> Optional[str]: ...
    def unissued(self) -> str: ...


QUANTUM_LINK_SUBTYPES = ("fixed-basis", "random-basis", "partial", "correction-bit")


def attack_key_of(config: dict) -> str:
    a = config["attack"]
    if a == "tampering":
        return f"tampering-{config['subtype']}"
    if a == "replay":
        return f"replay-{config['replayType']}"
    return a


class _Clock:
    """Logical clock mirroring the mock's increments exactly (§10.4)."""

    def __init__(self) -> None:
        self.t = 0

    def tick(self, dt: int) -> int:
        self.t += dt
        return self.t


class _Emitter:
    def __init__(self) -> None:
        self.clock = _Clock()
        self.events: list[dict] = []
        self.logs: list[dict] = []

    def event(self, kind: str, dt: int = 0, **payload: Any) -> None:
        t = self.clock.tick(dt)
        self.events.append({"kind": kind, "tMs": t, **payload})

    def log(self, code: str, stage: str, actor: str, level: str, message: str,
            payload: Optional[dict] = None, dt: int = 300) -> None:
        t = self.clock.tick(dt)
        frame = {"kind": "log", "tMs": t, "stage": stage, "actor": actor,
                 "code": code, "level": level, "message": message, "payload": payload}
        self.events.append(frame)
        self.logs.append({"timeMs": t, "stage": stage, "actor": actor, "code": code,
                          "level": level, "message": message, "payload": payload})


def _verifier_report(v: Optional[P.VerifierEvidence]) -> dict:
    if v is None:
        return {"verdict": "NOT RUN", "bagsWrong": None, "rates": None,
                "passed": 0, "failed": 0, "worstBag": None}
    return {
        "verdict": v.verdict,
        "bagsWrong": [int(x) for x in v.bags_wrong],
        "rates": {k: round(float(r), 4) for k, r in v.rates.items()},
        "passed": v.passed, "failed": v.failed,
        "worstBag": {"index": v.worst[0], "wrong": v.worst[1]},
    }


def _fingerprint_dict(fp: Optional[detection.Fingerprint]) -> Optional[dict]:
    if fp is None:
        return None
    return {
        "best": fp.best, "bestLabel": fp.best_label, "distance": fp.distance,
        "runnerUp": fp.runner_up, "runnerUpLabel": fp.runner_up_label,
        "runnerUpDistance": fp.runner_up_distance, "library": fp.library,
    }


def run(session_id: str, seed: int, config: dict, catalog: dict[str, dict],
        ledger: LedgerPort) -> RunRecord:
    """Execute one full run. `catalog` maps attack_key -> catalog row dict.
    All ledger effects go through `ledger` inside the caller's transaction."""
    t_start = time.monotonic()
    attack = config["attack"]
    subtype = config.get("subtype")
    target = config.get("targetLink")
    message = config["message"]
    truth_key = attack_key_of(config)
    truth_row = catalog[truth_key]

    em = _Emitter()
    em.event("session", dt=60, sessionId=session_id, seed=seed, message=message)
    em.log("SESSION_CREATED", "fidelity", "system", "info",
           narrative.session_created(session_id, seed),
           {"sessionId": session_id, "seed": seed})

    ev = P.execute(config, seed)
    fid = ev.fidelity
    fid_payload = {"F": round(fid.F, 4), "gate": fid.gate, "reference_fake": fid.fake}

    # ---------------- stage 1: fidelity gate ------------------------------------
    if fid.passed:
        em.log("FIDELITY_TEST_PASSED", "fidelity", "system", "check",
               narrative.fidelity_passed(fid.F, fid.gate), fid_payload)
        em.event("fidelity", F=round(fid.F, 4), gate=fid.gate, passed=True,
                 referenceFake=fid.fake)
        ledger.admit(session_id)
    else:
        em.log("FIDELITY_TEST_FAILED", "fidelity", "system", "attack",
               narrative.fidelity_failed(fid.F, fid.gate), fid_payload)
        em.event("fidelity", F=round(fid.F, 4), gate=fid.gate, passed=False,
                 referenceFake=fid.fake)
        ledger.refuse(session_id)
        em.log("IMPERSONATION_STOPPED", "fidelity", "eve", "attack",
               narrative.impersonation_stopped(), {"fake": fid.fake})
        em.event("done", dt=600, sessionId=session_id)
        return _finish(session_id, seed, config, catalog, em, ev,
                       cls=detection.Classification("impersonation", 0.99, None, None, None, None),
                       ledger_result=None, ledger_final="REFUSED",
                       stopped_at="fidelity", injected_at="fidelity",
                       t_start=t_start)

    # ---------------- stages 2–4: keys, distribute, sign ------------------------
    bits = "".join(str(int(b)) for b in ev.codeword)
    em.log("KEYS_GENERATED", "keys", "alice", "info",
           narrative.keys_generated(BAGS, SLOTS_PER_BAG),
           {"bags": BAGS, "slotsPerBag": SLOTS_PER_BAG})
    em.event("keys", bits=bits, openedBags=list(range(BAGS)))

    is_correction = attack == "tampering" and subtype == "correction-bit"
    for set_name, verifier in P.SETS:
        em.log("TELEPORT_DONE", "distribute", "alice", "info",
               narrative.teleport_done(set_name, verifier), {"set": set_name}, dt=500)
        correction = None
        if is_correction:
            s = ev.correction_samples[set_name]
            correction = {"sent": s["sent"], "received": s["received"], "flipped": s["flipped"]}
        em.event("distribute", set=set_name, correction=correction)

    slots_attacked = ev.slots_attacked
    inject_payload = {
        "attack": attack, "subtype": subtype, "target": target,
        "slotsAttacked": slots_attacked, "slotsTotal": SLOTS_PER_BAG,
        "tamperedMessage": config.get("tamperedMessage"),
        "correctionFlipped": None,
    }
    injected_at: Optional[str] = None
    if attack == "tampering" and subtype in QUANTUM_LINK_SUBTYPES:
        injected_at = "distribute"
        if is_correction:
            tset = "a" if target in ("bob", "both") else "b"
            s = ev.correction_samples[tset]
            inject_payload["correctionFlipped"] = f"{s['sent']}→{s['received']}"
        em.log("ATTACK_INJECTED", "distribute", "eve", "attack",
               _eve_acts(truth_row["label"], target), {"attack": truth_row["label"], "target": target})
        em.event("inject", **inject_payload)

    em.log("SIGNATURE_CREATED", "sign", "alice", "info",
           narrative.signature_created(message, ev.digest),
           {"message": message, "digest": ev.digest}, dt=520)
    em.event("sign", message=message, digest=ev.digest, bits=bits)

    if attack in ("forgery",) or (attack == "tampering" and subtype == "message-substitution"):
        injected_at = "sign"
        em.log("ATTACK_INJECTED", "sign", "eve", "attack",
               _eve_acts(truth_row["label"], target), {"attack": truth_row["label"], "target": target})
        em.event("inject", **inject_payload)

    # ---------------- stage 5 entry: the ledger ----------------------------------
    if attack == "replay":
        injected_at = "verify"  # decision C2
        em.log("ATTACK_INJECTED", "verify", "eve", "attack",
               _eve_acts(truth_row["label"], target), {"attack": truth_row["label"], "target": None})
        if config["replayType"] == "used":
            presented = ledger.victim(exclude=session_id)
            if presented is None:  # callers pre-run a baseline; this is a hard bug if hit
                raise RuntimeError("replay-used requires a consumed honest session")
        else:
            presented = ledger.unissued()
        out = ledger.lookup(session_id, presented)
        code = "LEDGER_LOOKUP_USED" if out["outcome"] == "REJECTED_USED" else "LEDGER_LOOKUP_NOT_FOUND"
        msg = (narrative.ledger_used(presented) if out["outcome"] == "REJECTED_USED"
               else narrative.ledger_not_found(presented))
        em.log(code, "verify", "system", "attack", msg,
               {"queried_id": presented, "found": out["found"], "status": out["status"]}, dt=500)
        em.event("ledger", queriedId=presented, found=out["found"],
                 status=out["status"], stop=True)
        em.event("done", dt=400, sessionId=session_id)
        detected = "replay-used" if out["outcome"] == "REJECTED_USED" else "replay-unknown"
        return _finish(session_id, seed, config, catalog, em, ev,
                       cls=detection.Classification(detected, 0.99, None, None, None, None),
                       ledger_result={"queriedId": presented, "found": out["found"],
                                      "status": out["status"],
                                      "reason": narrative.ledger_reason(out["outcome"])},
                       ledger_final="ACTIVE",  # the run's OWN key stays ACTIVE; Eve presented another
                       stopped_at="verify", injected_at=injected_at, t_start=t_start,
                       ledger_outcome=out["outcome"])

    out = ledger.lookup(session_id, session_id)
    em.log("LEDGER_LOOKUP_ACTIVE", "verify", "system", "check",
           narrative.ledger_active(session_id), {"status": "ACTIVE"}, dt=480)
    em.event("ledger", queriedId=session_id, found=True, status="ACTIVE", stop=False)

    # ---------------- stage 5: verification ---------------------------------------
    for set_name, verifier in P.SETS:
        v = ev.verifiers[verifier]
        prefix = verifier.upper()
        em.log(f"{prefix}_VERIFY_START", "verify", verifier, "info",
               narrative.verify_start(verifier), None, dt=500)
        for j in range(BAGS):
            wrong = int(v.bags_wrong[j])
            em.event("verify-bag", dt=18, verifier=verifier, bagIndex=j, wrong=wrong,
                     passLine=PASS_LINE, fail=wrong >= PASS_LINE, checked=SLOTS_PER_BAG)
        ok = v.verdict == "ACCEPTED"
        em.log(f"{prefix}_VERIFY_{'PASSED' if ok else 'FAILED'}", "verify", verifier,
               "check" if ok else "attack",
               narrative.verify_done(verifier, v.passed, v.failed, ok),
               {"failed": v.failed, "passLine": PASS_LINE}, dt=460)
        em.event("verify-done", verifier=verifier, passed=v.passed, failed=v.failed,
                 verdict=v.verdict, rates={k: round(float(r), 4) for k, r in v.rates.items()})

    # ---------------- stage 6: analysis --------------------------------------------
    cls = detection.classify(ev, None)
    det_row = catalog.get(cls.detected_key)
    classification_text = det_row["classification"] if det_row else "Rejected — pattern unclassified"
    cause_text = det_row["root_cause"] if det_row else narrative.unclassified_diagnosis()["cause"]

    analysis_labels = (
        "Mismatch counts → error rates per basis",
        "Fingerprint → classification",
        "Classification → root cause",
        "Root cause → severity",
        "Evidence summarized",
    )
    em.log("FINGERPRINT_MATCHED", "verify", "system", "check",
           narrative.fingerprint_matched(cls.fingerprint.best_label), None)
    em.event("analysis", dt=140, step=0, label=analysis_labels[0])
    em.log("CLASSIFIED", "verify", "system", "check",
           narrative.classified(classification_text), None)
    em.event("analysis", dt=140, step=1, label=analysis_labels[1])
    em.log("ROOT_CAUSE_SET", "verify", "system", "check",
           narrative.root_cause_set(cause_text), None)
    em.event("analysis", dt=140, step=2, label=analysis_labels[2])
    em.log("SEVERITY_COMPUTED", "verify", "system", "check",
           narrative.severity_computed(), None)
    em.event("analysis", dt=140, step=3, label=analysis_labels[3])
    em.log("KEYS_DESTROYED", "verify", "alice", "info", narrative.keys_destroyed(), None)
    em.event("analysis", dt=140, step=4, label=analysis_labels[4])
    em.event("done", dt=200, sessionId=session_id)

    return _finish(session_id, seed, config, catalog, em, ev, cls=cls,
                   ledger_result=None, ledger_final="USED", stopped_at=None,
                   injected_at=injected_at, t_start=t_start)


def _eve_acts(label: str, target: Optional[str]) -> str:
    where = {"bob": " on the link to Bob", "charlie": " on the link to Charlie",
             "both": " on the link to both verifiers"}.get(target or "", "")
    return f"Eve acts: {label}{where}."


# ---------------------------------------------------------------- result assembly
def _finish(session_id: str, seed: int, config: dict, catalog: dict[str, dict],
            em: _Emitter, ev: P.EngineEvidence, *, cls: detection.Classification,
            ledger_result: Optional[dict], ledger_final: str,
            stopped_at: Optional[str], injected_at: Optional[str],
            t_start: float, ledger_outcome: Optional[str] = None) -> RunRecord:
    attack = config["attack"]
    subtype = config.get("subtype")
    truth_key = attack_key_of(config)
    truth_row = catalog[truth_key]
    det_row = catalog.get(cls.detected_key)

    bob, charlie = ev.verifiers.get("bob"), ev.verifiers.get("charlie")
    measured = bob is not None and charlie is not None

    # verdict (D11): every gate green and both verifiers accept
    accepted = (ev.fidelity.passed and ledger_outcome is None and measured
                and bob.verdict == "ACCEPTED" and charlie.verdict == "ACCEPTED")
    verdict = "ACCEPTED" if accepted else "REJECTED"
    missed = verdict == "ACCEPTED" and truth_key != "no-attack"

    max_wrong = 0
    if measured:
        max_wrong = int(max(bob.bags_wrong.max(), charlie.bags_wrong.max()))
    sev = detection.severity(verdict, cls.confidence, max_wrong,
                             det_row["category_part"] if det_row else 5)

    classification_text = (det_row["classification"] if det_row
                           else "Rejected — pattern unclassified")

    # fidelity block
    fidelity_test = {
        "F": round(ev.fidelity.F, 4), "gate": ev.fidelity.gate,
        "referenceFake": ev.fidelity.fake, "passed": ev.fidelity.passed,
        "failReason": None if ev.fidelity.passed else narrative.fidelity_fail_reason(),
    }

    # agreement + fingerprint + bag distribution: only with measurements
    agreement = None
    fingerprint_match = None
    bag_distribution = None
    if measured:
        agreement = narrative.agreement(bob.verdict, charlie.verdict,
                                        cls.secondary_key is not None)
        fingerprint_match = _fingerprint_dict(cls.fingerprint)
        primary_ev = ev.verifiers.get(cls.primary or "bob")
        bag_distribution = detection.bag_distribution(primary_ev)
        if bag_distribution:
            bag_distribution["falseRejection"] = float(bag_distribution["falseRejection"])

    # detection curve: partial runs only (§7.7)
    curve = detection.detection_curve(config.get("intensityPct") or 25) \
        if subtype == "partial" else None

    # why-chain
    if not ev.fidelity.passed:
        why = narrative.why_chain(fidelity_F=ev.fidelity.F, gate=ev.fidelity.gate,
                                  fidelity_passed=False)
    elif ledger_outcome is not None:
        why = narrative.why_chain(fidelity_F=ev.fidelity.F, gate=ev.fidelity.gate,
                                  fidelity_passed=True, ledger_stop=ledger_outcome,
                                  queried_id=ledger_result["queriedId"])
    else:
        any_failed = bob.failed + charlie.failed > 0
        why = narrative.why_chain(
            fidelity_F=ev.fidelity.F, gate=ev.fidelity.gate, fidelity_passed=True,
            any_failed=any_failed, failed_total=bob.failed + charlie.failed,
            max_wrong=max_wrong,
            best_label=cls.fingerprint.best_label if cls.fingerprint else None,
            best_distance=cls.fingerprint.distance if cls.fingerprint else None,
        )

    # attackConfig + attackPath (ground truth; missed attacks say so)
    caught_by = narrative.missed_caught_by() if missed else truth_row["caught_by"]
    correction_mutation = None
    correction_bits = None
    if subtype == "correction-bit":
        tset = "a" if config.get("targetLink") in ("bob", "both") else "b"
        s = ev.correction_samples.get(tset)
        if s:
            correction_mutation = f"{s['sent']}→{s['received']}"
            correction_bits = {"sent": s["sent"], "received": s["received"],
                               "convention": narrative.CORRECTION_CONVENTION}
    attack_config = {
        "attack": attack, "subtype": subtype, "targetLink": config.get("targetLink"),
        "basis": config.get("fixedBasis"), "intensityPct": config.get("intensityPct"),
        "slotsAttacked": ev.slots_attacked, "slotsTotal": SLOTS_PER_BAG,
        "tamperedMessage": config.get("tamperedMessage"),
        "correctionMutation": correction_mutation,
        "replayType": config.get("replayType"),
        "injectedBetween": truth_row["injected_between"], "caughtBy": caught_by,
    }

    bch_diff = None
    if ev.changed_positions is not None:
        changed = [j in set(ev.changed_positions) for j in range(BAGS)]
        bch_diff = {"k": len(ev.changed_positions),
                    "changedPositions": ev.changed_positions, "changed": changed}

    diagnosis = ({"key": cls.detected_key, "cause": det_row["root_cause"],
                  "mitigation": list(det_row["mitigations"])}
                 if det_row else narrative.unclassified_diagnosis())

    if missed:
        story = narrative.missed_story(
            attack, subtype, intensity_pct=config.get("intensityPct"),
            slots_attacked=ev.slots_attacked,
            signature_detection=curve["signatureAt"] if curve else None)
    else:
        story = det_row["story"] if det_row else narrative.unclassified_diagnosis()["cause"]

    result = {
        "sessionId": session_id, "seed": seed, "message": config["message"],
        "verdict": verdict, "classification": classification_text,
        "confidence": round(float(cls.confidence), 4),
        "verdictBanner": {
            "severity": sev,
            "fidelityTest": fidelity_test,
            "ledger": ledger_result,
            "verifiers": {"bob": _verifier_report(bob), "charlie": _verifier_report(charlie)},
            "agreement": agreement,
            "fingerprintMatch": fingerprint_match,
            "why": why,
            "attackConfig": attack_config,
            "bchDiff": bch_diff,
            "correctionBits": correction_bits,
            "detectionCurve": curve,
            "bagDistribution": bag_distribution,
            "diagnosis": diagnosis,
        },
        "attackPath": {"injected": truth_row["injected_between"],
                       "caught": truth_row["caught_by"]},
        "story": story,
        "stoppedAt": stopped_at,
        "injectedAt": injected_at,
    }

    verifier_rows = []
    for name, v in (("bob", bob), ("charlie", charlie)):
        if v is None:
            verifier_rows.append({"verifier": name, "verdict": "NOT_RUN", "bags_wrong": None,
                                  "rate_z": None, "rate_x": None, "rate_y": None,
                                  "passed": 0, "failed": 0,
                                  "worst_bag_index": None, "worst_bag_wrong": None})
        else:
            verifier_rows.append({"verifier": name, "verdict": v.verdict,
                                  "bags_wrong": [int(x) for x in v.bags_wrong],
                                  "rate_z": float(v.rates["Z"]), "rate_x": float(v.rates["X"]),
                                  "rate_y": float(v.rates["Y"]), "passed": v.passed,
                                  "failed": v.failed, "worst_bag_index": v.worst[0],
                                  "worst_bag_wrong": v.worst[1]})

    params = dict(SYSTEM_PARAMS)
    params.update({"noiseQ": LINK_NOISE_Q, "fidelityPairsPerBasis": FIDELITY_PAIRS_PER_BASIS})

    return RunRecord(
        session_id=session_id, seed=seed, config=config,
        events=em.events, logs=em.logs, result=result,
        verifier_rows=verifier_rows, ledger_lookups=[], ledger_final=ledger_final,
        attack_key=truth_key, detected_key=cls.detected_key, verdict=verdict,
        classification=classification_text, confidence=round(float(cls.confidence), 4),
        severity=sev["score"], stopped_at=stopped_at, injected_at=injected_at,
        story=story, params=params, engine_version=ENGINE_VERSION,
        duration_ms=int((time.monotonic() - t_start) * 1000),
    )
