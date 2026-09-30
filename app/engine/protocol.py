"""
QDS protocol (REPORT §6) — keygen, fidelity admission, teleportation
distribution, signing and verification, with Eve acting only through channels.

Everything statistical EMERGES from the state-vector simulation in quantum.py.
This module never contains an attack probability, and never edits an outcome.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from app.engine import attacks, bch
from app.engine import quantum as Q
from app.engine.constants import (
    BAGS, FIDELITY_GATE, FIDELITY_PAIRS_PER_BASIS, FIDELITY_SIGMA_FACTOR,
    LINK_NOISE_Q, PASS_LINE, SLOTS_PER_BAG,
)
from app.engine.rng import stream

SETS = (("a", "bob"), ("b", "charlie"))
FLAT = BAGS * 2 * SLOTS_PER_BAG  # 16,128 slots per verifier


# ------------------------------------------------------------------ evidence
@dataclass
class LinkFidelity:
    F: float
    sigma: float
    passed: bool


@dataclass
class FidelityEvidence:
    per_link: dict[str, LinkFidelity]
    F: float           # min over links (REPORT D8)
    sigma: float       # sigma of the reported (minimum) link
    passed: bool       # every link satisfies F - 4*sigma > gate
    gate: float
    fake: bool         # Eve supplied the resource (impersonation config echo)


@dataclass
class VerifierEvidence:
    bags_wrong: np.ndarray                 # (63,)
    wrong: np.ndarray                      # (63, 128) bool per opened slot
    announced_basis: np.ndarray            # (63, 128) basis announced in the signature
    rates: dict[str, float]                # grouped by announced basis
    passed: int
    failed: int
    worst: tuple[int, int]                 # (index, wrong)
    verdict: str                           # ACCEPTED | REJECTED


@dataclass
class EngineEvidence:
    fidelity: FidelityEvidence
    codeword: Optional[np.ndarray] = None          # (63,) public bits
    digest: str = ""
    verifiers: dict[str, Optional[VerifierEvidence]] = field(default_factory=dict)
    changed_positions: Optional[list[int]] = None  # message substitution
    correction_samples: dict[str, dict] = field(default_factory=dict)  # per set: sent/received/flipped (D19)
    slots_attacked: Optional[int] = None           # partial: k


# ------------------------------------------------------------------ helpers
def _affected(target_link: Optional[str], verifier: str) -> bool:
    return target_link == "both" or target_link == verifier


def _basis_names(idx: np.ndarray) -> np.ndarray:
    return np.asarray(Q.BASIS_NAME)[idx]


# ------------------------------------------------------------------ stage 1
def fidelity_test(seed: int, impersonation: bool) -> FidelityEvidence:
    """Per-link Bell test on dedicated pairs (never reused as key material).
    Honest links: |Phi+> through the depolarising link. Impersonation: Eve's
    optimal separable resource on both links. Pass rule per link:
    F - 4*sigma_F > gate; reported F is the minimum link (D8)."""
    eve_rng = stream(seed, "eve")
    per_link: dict[str, LinkFidelity] = {}
    for set_name, verifier in SETS:
        rng = stream(seed, f"fidelity-{set_name}")
        ex: dict[int, float] = {}
        var: dict[int, float] = {}
        for basis in (0, 1, 2):
            n = FIDELITY_PAIRS_PER_BASIS
            if impersonation:
                pairs = Q.StateBatch(attacks.separable_bell_resource(eve_rng, n))
            else:
                pairs = Q.bell_pairs(n)
                pairs.depolarise(1, LINK_NOISE_Q, rng)  # the transmitted half
            prods = Q.correlation_products(pairs, basis, rng)
            ex[basis] = float(prods.mean())
            var[basis] = float(prods.var(ddof=1) / n)
        F = Q.fidelity_from_correlations(ex[1], ex[2], ex[0])
        sigma = float(np.sqrt(var[0] + var[1] + var[2]) / 4.0)
        per_link[verifier] = LinkFidelity(F=F, sigma=sigma,
                                          passed=(F - FIDELITY_SIGMA_FACTOR * sigma) > FIDELITY_GATE)
    worst = min(per_link.values(), key=lambda l: l.F)
    return FidelityEvidence(
        per_link=per_link,
        F=worst.F,
        sigma=worst.sigma,
        passed=all(l.passed for l in per_link.values()),
        gate=FIDELITY_GATE,
        fake=impersonation,
    )


# ------------------------------------------------------------------ stage 2
def generate_keys(seed: int, set_name: str) -> tuple[np.ndarray, np.ndarray]:
    """Alice's private material for one verifier: secret uniform (basis, value)
    per slot, from her private stream — never derived from indices (D4).
    Shape (63 positions, 2 bags, 128 slots)."""
    rng = stream(seed, f"alice-keys-{set_name}")
    basis = rng.integers(0, 3, (BAGS, 2, SLOTS_PER_BAG), dtype=np.int8)
    value = rng.integers(0, 2, (BAGS, 2, SLOTS_PER_BAG), dtype=np.int8)
    return basis, value


# ------------------------------------------------------------------ stage 3
def distribute(seed: int, set_name: str, basis: np.ndarray, value: np.ndarray,
               *, quantum_attack: Optional[dict] = None,
               flip_corrections: bool = False) -> tuple[Q.StateBatch, dict]:
    """Teleport every slot of both bags to the verifier: Bell pair -> link noise
    -> (Eve on the quantum link) -> Alice's Bell measurement -> classical bits
    -> (Eve on the classical link) -> verifier Pauli correction.
    Returns the verifier's register (qubit 2 live) and the D19 correction sample."""
    psi = Q.eigenstate_batch(basis.reshape(-1), value.reshape(-1))
    st = Q.attach_states(psi, Q.bell_pairs(FLAT))
    st.depolarise(2, LINK_NOISE_Q, stream(seed, f"noise-{set_name}"))

    if quantum_attack is not None:
        channel = Q.QuantumChannel(st, 2, stream(seed, "eve"))
        attacks.intercept_resend(channel, stream(seed, "eve"),
                                 mode=quantum_attack["mode"],
                                 fixed_basis=quantum_attack.get("fixed_basis"),
                                 mask=quantum_attack.get("mask"))

    m1, m2 = Q.bsm(st, stream(seed, f"alice-bell-measure-{set_name}"))
    sent = (int(m1[0]), int(m2[0]))  # slot 0 of bag 0 (D19)

    channel = Q.ClassicalChannel(m1, m2)
    if flip_corrections:
        attacks.flip_correction_bits(channel)
    m1, m2 = channel.tap()
    received = (int(m1[0]), int(m2[0]))

    st.pauli_correction(2, m1, m2)
    sample = {
        "sent": f"{sent[0]}{sent[1]}",
        "received": f"{received[0]}{received[1]}",
        "flipped": bool(flip_corrections),
    }
    return st, sample


# ------------------------------------------------------------------ stage 4
def sign(basis: np.ndarray, value: np.ndarray, codeword: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Open bag K(j, c_j) per position: the signature is the classical
    (basis, value) descriptions of the opened bags only (D5). Returns
    (63, 128) announced basis and value arrays."""
    pos = np.arange(BAGS)
    return basis[pos, codeword, :].copy(), value[pos, codeword, :].copy()


# ------------------------------------------------------------------ stage 5
def verify(seed: int, set_name: str, register: Q.StateBatch,
           opened_bag: np.ndarray, announced_basis: np.ndarray,
           announced_value: np.ndarray) -> VerifierEvidence:
    """The verifier measures each slot of the bag it opens in the ANNOUNCED
    basis and counts mismatches with the announced value. All other slots
    (the unopened bags) are destroyed unmeasured. Bag fails at >= 12 wrong;
    the verifier passes only if all 63 bags pass."""
    pos = np.arange(BAGS)
    flat_idx = ((pos[:, None] * 2 + opened_bag[:, None]) * SLOTS_PER_BAG
                + np.arange(SLOTS_PER_BAG)[None, :]).reshape(-1)
    opened = register.take(flat_idx)  # the rest of the register is destroyed

    outcomes = opened.measure(2, announced_basis.reshape(-1),
                              stream(seed, f"verify-{set_name}"))
    wrong = (outcomes.reshape(BAGS, SLOTS_PER_BAG) != announced_value).astype(bool)

    bags_wrong = wrong.sum(axis=1)
    rates = {}
    for b, name in enumerate(Q.BASIS_NAME):
        sel = announced_basis == b
        total = int(sel.sum())
        rates[name] = float(wrong[sel].sum() / total) if total else 0.0

    failed = int((bags_wrong >= PASS_LINE).sum())
    worst_idx = int(np.argmax(bags_wrong))
    return VerifierEvidence(
        bags_wrong=bags_wrong.astype(int),
        wrong=wrong,
        announced_basis=announced_basis,
        rates=rates,
        passed=BAGS - failed,
        failed=failed,
        worst=(worst_idx, int(bags_wrong[worst_idx])),
        verdict="ACCEPTED" if failed == 0 else "REJECTED",
    )


# ------------------------------------------------------------------ whole run
def execute(config: dict, seed: int) -> EngineEvidence:
    """Run the physics of one session. `config` is the resolved run config
    (camelCase keys as the wire echo). Ledger decisions live OUTSIDE this
    function (pipeline): for replay runs the caller simply never calls the
    measurement — this function then skips stage 5 (verifiers None)."""
    attack = config["attack"]
    subtype = config.get("subtype")
    target = config.get("targetLink")

    ev = EngineEvidence(fidelity=fidelity_test(seed, impersonation=(attack == "impersonation")))
    if not ev.fidelity.passed:
        return ev  # session refused: no keys, no signature, nothing measured

    codeword = bch.codeword_for(config["message"])
    ev.codeword = codeword
    ev.digest = bch.digest8(config["message"])

    tampered_codeword = None
    if attack == "tampering" and subtype == "message-substitution":
        tampered_codeword = bch.codeword_for(config["tamperedMessage"])
        ev.changed_positions = [int(j) for j in np.flatnonzero(codeword != tampered_codeword)]

    eve_sig = None
    if attack == "forgery":
        eve_sig = attacks.forged_signature(stream(seed, "eve"), BAGS, SLOTS_PER_BAG)

    mask = None
    if attack == "tampering" and subtype == "partial":
        k = int(np.floor((config.get("intensityPct") or 25) * SLOTS_PER_BAG / 100 + 0.5))
        mask, _ = attacks.partial_slot_mask(stream(seed, "eve-select"), SLOTS_PER_BAG, k, FLAT)
        ev.slots_attacked = k

    measured = attack not in ("replay",)  # impersonation already returned above
    ev.verifiers = {"bob": None, "charlie": None}

    for set_name, verifier in SETS:
        basis, value = generate_keys(seed, set_name)

        q_attack = None
        if attack == "tampering" and _affected(target, verifier):
            if subtype == "fixed-basis":
                q_attack = {"mode": "fixed", "fixed_basis": Q.BASIS_NAME.index(config["fixedBasis"])}
            elif subtype == "random-basis":
                q_attack = {"mode": "random"}
            elif subtype == "partial":
                q_attack = {"mode": "random", "mask": mask}
        flip = (attack == "tampering" and subtype == "correction-bit"
                and _affected(target, verifier))

        register, sample = distribute(seed, set_name, basis, value,
                                      quantum_attack=q_attack, flip_corrections=flip)
        ev.correction_samples[set_name] = sample

        announced_basis, announced_value = sign(basis, value, codeword)
        if eve_sig is not None:
            announced_basis, announced_value = eve_sig  # Eve's packet replaces Alice's

        if not measured:
            continue  # replay: rejected at the ledger before any measurement

        opened = codeword.copy()
        if tampered_codeword is not None and _affected(target, verifier):
            opened = tampered_codeword.copy()  # the verifier derives c(m') and opens THOSE bags

        ev.verifiers[verifier] = verify(seed, set_name, register, opened,
                                        announced_basis, announced_value)
    return ev
