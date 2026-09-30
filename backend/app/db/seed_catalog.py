"""
Seed content for `attack_catalog` — the ONLY place root causes, mitigations and
banner stories live. The frontend must not keep its own copy (REPORT §11).

Wording rules (spec §13): never use the words block, collusion, arbitration,
verifier-cross-check, classical-mac, malicious, compromised. `assert_clean()`
enforces this and is called by `upsert_catalog()`.

Bump CATALOG_VERSION whenever any text changes; `upsert_catalog` rewrites rows
whose version is lower.
"""
from __future__ import annotations

import re

from sqlalchemy.dialects.postgresql import insert as pg_insert

from models import AttackCatalog

CATALOG_VERSION = 1

BANNED = ("block", "collusion", "arbitration", "verifier-cross-check", "classical-mac", "malicious", "compromised")

CATALOG: list[dict] = [
    dict(
        attack_key="no-attack", attack="no-attack", subtype=None, label="No attack",
        classification="No incident — signature accepted by Bob and Charlie",
        category_part=0, injected_between="—", caught_by="— (all checks passed)",
        root_cause="No anomaly detected. Mismatch stayed at honest-noise level in every bag at both verifiers.",
        mitigations=["None required"],
        story="A normal run: Alice signed, Bob and Charlie both verified, and mismatches stayed at honest-noise levels.",
    ),
    dict(
        attack_key="forgery", attack="forgery", subtype=None, label="Forgery",
        classification="Forgery",
        category_part=9, injected_between="Between signing and verification", caught_by="Bag threshold at Bob and Charlie",
        root_cause="The signature was not produced from Alice's private quantum states. Its claims disagree with the qubits both verifiers hold in about half of all slots, which is what blind guessing produces.",
        mitigations=[
            "Reject the message and log the event",
            "Trace where the signature packet originated",
            "No key exposure to revoke: quantum material is one-time and destroyed after every run",
        ],
        story="Eve produced a signature without Alice's private quantum information, so the verifiers' measurements disagreed with her claims.",
    ),
    dict(
        attack_key="impersonation", attack="impersonation", subtype=None, label="Impersonation",
        classification="Impersonation",
        category_part=8, injected_between="Stage 1 (session admission)", caught_by="Fidelity Test",
        root_cause="The requester could not demonstrate shared entanglement at session admission. Fidelity stayed at or below 0.5, the ceiling for any resource that is not genuinely entangled.",
        mitigations=[
            "Refuse the session; no keys are generated",
            "Verify the requester through an independent channel",
            "Inspect the quantum link and source hardware if failures are unexpected",
        ],
        story="Eve tried to start a session as Alice but couldn't demonstrate the entangled resource, so the session was refused before any key or signature existed.",
    ),
    dict(
        attack_key="replay-used", attack="replay", subtype="used", label="Replay",
        classification="Replay — session already used",
        category_part=5, injected_between="Stage 5 entry", caught_by="Session ledger lookup",
        root_cause="A previously verified session key was resubmitted. Session keys are single-use and this one is already marked USED.",
        mitigations=[
            "Keep session keys strictly single-use (atomic ACTIVE to USED)",
            "Alert on repeated submissions of USED sessions",
            "Investigate how the old transaction was captured",
        ],
        story="Eve resent a genuine old transaction; the ledger showed it was already used, so it was rejected before any quantum measurement.",
    ),
    dict(
        attack_key="replay-unknown", attack="replay", subtype="unknown", label="Replay",
        classification="Unauthorized session (unknown session ID)",
        category_part=6, injected_between="Stage 5 entry", caught_by="Session ledger lookup",
        root_cause="The presented session key was never issued by this system, so no quantum material exists that could match it.",
        mitigations=[
            "Reject and log the source",
            "Rate-limit repeated unknown-key submissions",
            "Review how the identifier was obtained or guessed",
        ],
        story="Eve submitted a session ID the ledger has never authorized, so it was rejected before any quantum measurement.",
    ),
    dict(
        attack_key="tampering-fixed-basis", attack="tampering", subtype="fixed-basis", label="Tampering (fixed-basis)",
        classification="Fixed-basis intercept-resend",
        category_part=7, injected_between="Quantum link, before measurement", caught_by="Bag threshold + fingerprint",
        root_cause="An interceptor on the quantum link measures every qubit in one fixed basis and resends it. That basis survives; the other two are disturbed to about one half. The clean basis shows which one Eve fixed.",
        mitigations=[
            "Inspect the affected physical link for taps",
            "Route around the affected link until it is cleared",
            "Use fresh quantum material for the next session (automatic: keys are one-time)",
        ],
        story="Eve measured every qubit she intercepted with one basis, disturbing two bases heavily and leaving the third almost clean.",
    ),
    dict(
        attack_key="tampering-random-basis", attack="tampering", subtype="random-basis", label="Tampering (random-basis)",
        classification="Random-basis intercept-resend",
        category_part=8, injected_between="Quantum link, before measurement", caught_by="Bag threshold + fingerprint",
        root_cause="An interceptor on the quantum link guesses a measurement basis for each qubit and resends it. Every basis ends up disturbed by about one third.",
        mitigations=[
            "Treat the quantum channel as untrusted",
            "Investigate physical access to the fibre or free-space path",
            "Use fresh quantum material and a different link for the next session",
        ],
        story="Eve guessed a basis for each qubit she intercepted, leaving equal disturbance in all three bases.",
    ),
    dict(
        attack_key="tampering-partial", attack="tampering", subtype="partial", label="Tampering (partial)",
        classification="Partial / stealth intercept",
        category_part=6, injected_between="Quantum link, before measurement", caught_by="Bag threshold + heatmap + detection curve",
        root_cause="Intermittent interception on a share of slots dilutes the random-basis signature so that individual bags sit close to the pass line. Requiring all 63 bags to pass still makes detection likely, but not certain for weak attacks.",
        mitigations=[
            "Increase monitoring on the affected link",
            "Review repeated near-miss sessions on the same link",
            "Inspect the link for intermittent taps",
        ],
        story="Eve attacked only some slots to stay under the radar; requiring all 63 bags to pass makes even weak attacks likely to be caught, but a very weak one can slip through.",
    ),
    dict(
        attack_key="tampering-message-substitution", attack="tampering", subtype="message-substitution", label="Tampering (message substitution)",
        classification="Message substitution",
        category_part=8, injected_between="Classical channel, after signing", caught_by="Bag threshold + BCH-diff heatmap",
        root_cause="The message was altered after signing. The signature belongs to a different message, so bags fail exactly at the positions where the two encoded messages differ; the failed positions point to the originally signed message.",
        mitigations=[
            "Reject the message",
            "Verify message integrity along the delivery path",
            "Compare the failed positions with the encoded original to recover what was really signed",
        ],
        story="Eve swapped the message after signing, which changed encoded positions, so several bags failed.",
    ),
    dict(
        attack_key="tampering-correction-bit", attack="tampering", subtype="correction-bit", label="Tampering (correction-bit)",
        classification="Classical correction-bit tampering",
        category_part=7, injected_between="Classical link during teleportation (stage 3)", caught_by="Bag threshold + fingerprint",
        root_cause="The two teleportation correction bits were inverted on the classical link, which applies an extra Y error to every state received. Two bases fail almost completely and one stays clean.",
        mitigations=[
            "Investigate the classical link between Alice and the affected verifier",
            "Authenticate the classical communication layer (future scope)",
            "Re-run with fresh quantum material",
        ],
        story="Eve edited the teleportation correction bits, so the verifier rebuilt the wrong states and two bases showed near-total mismatch.",
    ),
]


def assert_clean() -> None:
    text = " ".join(
        " ".join([r["label"], r["classification"], r["caught_by"], r["injected_between"], r["root_cause"], r["story"], *r["mitigations"]])
        for r in CATALOG
    ).lower()
    hits = [w for w in BANNED if re.search(rf"\b{re.escape(w)}", text)]
    if hits:
        raise ValueError(f"banned terminology in catalog seed: {hits}")


def upsert_catalog(session) -> None:
    """Idempotent: inserts missing rows, rewrites rows whose version is older."""
    assert_clean()
    for row in CATALOG:
        stmt = pg_insert(AttackCatalog).values(**row, version=CATALOG_VERSION)
        update = {k: getattr(stmt.excluded, k) for k in row if k != "attack_key"} | {"version": CATALOG_VERSION}
        stmt = stmt.on_conflict_do_update(
            index_elements=[AttackCatalog.attack_key],
            set_=update,
            where=(AttackCatalog.version < CATALOG_VERSION),
        )
        session.execute(stmt)
