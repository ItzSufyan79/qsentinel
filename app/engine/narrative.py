"""
Narrative layer (REPORT §7.8–§7.9, §10.4): every human-readable string the
engine emits — log messages, why-chain, agreement reasons, ledger reasons,
missed-attack stories. Root cause / mitigation / story for detected outcomes
come from `attack_catalog`; nothing from the catalog is duplicated here.

Text rules: honest, evidence-first, no claims of intent beyond the scenario
labels; the banned-terms scan (T17) covers this whole module.
"""
from __future__ import annotations

from typing import Optional

from app.engine.constants import PASS_LINE

VERIFIER_TITLE = {"bob": "Bob", "charlie": "Charlie"}


# ------------------------------------------------------------------ log messages
def session_created(session_id: str, seed: int) -> str:
    return f"Session {session_id} requested by Alice (seed {seed})."


def fidelity_passed(F: float, gate: float) -> str:
    return f"Fidelity Test passed — F = {F:.2f} (> {gate}). Entanglement demonstrated."


def fidelity_failed(F: float, gate: float) -> str:
    return f"Fidelity Test failed — F = {F:.2f} (≤ {gate}): expected entangled resource not demonstrated."


def impersonation_stopped() -> str:
    return ("Eve cannot demonstrate a genuine entangled resource at session admission. "
            "Stages 2–5 never run.")


def keys_generated(bags: int, slots: int) -> str:
    return f"{bags} bags prepared — {slots} slots each (0-bag and 1-bag per encoded position)."


def teleport_done(set_name: str, verifier: str) -> str:
    return f"Independent quantum set {set_name.upper()} teleported to {VERIFIER_TITLE[verifier]}."


def signature_created(message: str, digest: str) -> str:
    return f'Signature created for "{message}" — digest {digest}, matching bags opened per encoded bit.'


def attack_injected(attack: str, subtype: Optional[str], target: Optional[str]) -> str:
    where = {"bob": "Bob's link", "charlie": "Charlie's link", "both": "both links"}.get(target or "", "the run")
    if attack == "forgery":
        return "Eve replaces Alice's signature with her own packet — guessed bases and values for every slot."
    if attack == "replay":
        return "Eve presents a previously seen session id at the verification desk."
    if subtype == "fixed-basis":
        return f"Eve measures every flying qubit on {where} in one fixed basis and resends what she got."
    if subtype == "random-basis":
        return f"Eve measures every flying qubit on {where} in a random basis and resends what she got."
    if subtype == "partial":
        return f"Eve measures a fraction of slots per bag on {where} and resends, staying quiet elsewhere."
    if subtype == "message-substitution":
        return "Eve swaps the classical message after signing; the quantum signature still describes the original."
    if subtype == "correction-bit":
        return f"Eve inverts the classical correction bits on {where} during teleportation."
    return "Eve interferes with the run."


def ledger_active(session_id: str) -> str:
    return f"Ledger lookup: session {session_id} is ACTIVE. Quantum verification proceeds."


def ledger_used(queried_id: str) -> str:
    return f"Ledger lookup: {queried_id} is already USED. Replay rejected before any quantum measurement."


def ledger_not_found(queried_id: str) -> str:
    return f"Ledger lookup: {queried_id} was never issued. Submission rejected before any quantum measurement."


def verify_start(verifier: str) -> str:
    return f"{VERIFIER_TITLE[verifier]} starts measuring stored qubits against the signature claims."


def verify_done(verifier: str, passed: int, failed: int, ok: bool) -> str:
    word = "passed" if ok else "failed"
    return f"{VERIFIER_TITLE[verifier]} {word}: {passed} of 63 bags passed ({failed} failed, pass line {PASS_LINE})."


def fingerprint_matched(label: str) -> str:
    return f"Observed rates closest to {label}."


def classified(classification: str) -> str:
    return f"Classification: {classification}."


def root_cause_set(cause: str) -> str:
    return f"Root cause: {cause}"


def severity_computed() -> str:
    return "Severity computed from confidence, deviation and category."


def keys_destroyed() -> str:
    return "One-time quantum material destroyed. Nothing can be re-verified."


# ------------------------------------------------------------------ result strings
def ledger_reason(outcome: str) -> str:
    return {
        "REJECTED_USED": "One-time quantum resource already consumed",
        "REJECTED_NOT_FOUND": "Session never authorized",
    }.get(outcome, "Single-use session key")


def fidelity_fail_reason() -> str:
    return "Expected entangled resource not demonstrated; session admission failed."


CORRECTION_CONVENTION = (
    "The two classical bits are inverted for a received slot: bases Z and X rebuild "
    "the wrong state, basis Y rebuilds correctly — so two bases run near 1 and one near 0."
)


def missed_caught_by() -> str:
    return "— nothing (this run stayed under every threshold)"


# ------------------------------------------------------------------ agreement (§7.3)
def agreement(bob_verdict: str, charlie_verdict: str,
              secondary_class_differs: bool) -> dict:
    if bob_verdict == charlie_verdict == "ACCEPTED":
        return {"consistent": True, "reason": "Both accept — consistent, strong agreement."}
    if bob_verdict == charlie_verdict == "REJECTED":
        if secondary_class_differs:
            return {"consistent": True,
                    "reason": ("Both reject, but the error patterns classify differently — "
                               "the primary verifier (more failed bags) drives the call.")}
        return {"consistent": True,
                "reason": "Both reject with similar fingerprints — likely an attack on the common signing/quantum process."}
    who_rej = "Bob" if bob_verdict == "REJECTED" else "Charlie"
    who_acc = "Charlie" if who_rej == "Bob" else "Bob"
    return {"consistent": False,
            "reason": (f"{who_rej} rejected, {who_acc} accepted — a split points to a "
                       f"localized attack on {who_rej}'s path.")}


# ------------------------------------------------------------------ why-chain (§7.8)
def why_chain(*, fidelity_F: float, gate: float, fidelity_passed: bool,
              ledger_stop: Optional[str] = None, queried_id: str = "",
              max_wrong: Optional[int] = None, any_failed: Optional[bool] = None,
              failed_total: Optional[int] = None, best_label: Optional[str] = None,
              best_distance: Optional[float] = None) -> list[dict]:
    steps: list[dict] = []
    if fidelity_passed:
        steps.append({
            "label": "Fidelity Test passed",
            "detail": f"The link is genuine: F = {fidelity_F:.2f} > {gate}. The sender is authenticated.",
            "chart": "fidelity",
        })
    else:
        steps.append({
            "label": "Fidelity never passed",
            "detail": (f"F = {fidelity_F:.2f} ≤ {gate}: the supplied resource is not entangled. "
                       "The session is refused before any key material exists."),
            "chart": "fidelity",
        })
        return steps

    if ledger_stop is not None:
        reason = ("already marked USED" if ledger_stop == "REJECTED_USED" else "never issued")
        steps.append({
            "label": "Stopped at the session ledger",
            "detail": (f"The presented session id {queried_id} is {reason}. "
                       "The one-time rule rejects the submission before any quantum measurement."),
            "chart": "bag-distribution",
        })
        return steps

    if any_failed:
        steps.append({
            "label": "Mismatches far beyond honest noise",
            "detail": (f"{failed_total} bag(s) crossed the pass line of {PASS_LINE}; "
                       f"the worst bag had {max_wrong} wrong slots of 128."),
            "chart": "bag-distribution",
        })
        steps.append({
            "label": "The error pattern matches an attack fingerprint",
            "detail": f"Closest library pattern: {best_label} (distance {best_distance:.3f}).",
            "chart": "fingerprint",
        })
    else:
        steps.append({
            "label": "Mismatches stayed at honest-noise levels",
            "detail": (f"Bob and Charlie found no bag above the pass line of {PASS_LINE}. "
                       "Nothing to explain."),
            "chart": "bag-distribution",
        })
    return steps


# ------------------------------------------------------------------ stories (D11)
def missed_story(attack: str, subtype: Optional[str], *, intensity_pct: Optional[int],
                 slots_attacked: Optional[int], signature_detection: Optional[float]) -> str:
    """Story for a REAL attack that stayed under every threshold (verdict ACCEPTED)."""
    if subtype == "partial" and intensity_pct is not None:
        pct = f"{signature_detection * 100:.0f}%" if signature_detection is not None else "low"
        return (
            f"Eve measured {slots_attacked} of 128 slots (~{intensity_pct}%) in every bag and stayed "
            f"under the pass line everywhere — this run slipped through. At {intensity_pct}% intensity the "
            f"expected chance of catching the signature is about {pct}, so quiet runs like this one are "
            f"expected sometimes. Stealth costs Eve impact; run it again and the dice roll again."
        )
    return (
        "The configured interference stayed below every decision threshold in this run: "
        "no bag crossed the pass line, the fidelity gate passed, and the ledger was clean. "
        "The evidence honestly reads as a normal session — re-run to sample again."
    )


def unclassified_diagnosis() -> dict:
    return {
        "key": "unclassified",
        "cause": "The signature was rejected, but the error pattern does not match any library fingerprint.",
        "mitigation": [
            "Re-run the session — one-time keys mean a fresh sample every time.",
            "Inspect the per-bag heatmap and per-basis rates for structure.",
        ],
    }
