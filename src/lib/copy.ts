/**
 * Static copy from the design report so the pages stay lean.
 *
 * This is UI wording only — sections 6.3 (stage captions), 10.1 (one-line
 * stories), 10.2 (root cause / mitigation library), 10.3 (fingerprint
 * library) and 10.4 (wording that must stay honest). No scientific number is
 * invented here; run-specific values arrive from the backend and replace the
 * `{placeholders}` below.
 */

import type { StageId } from "../api/types";

/* ------------------------------------------------------------------ *
 *  Stage narrations — report 6.3 (caption + Tell me more)
 * ------------------------------------------------------------------ */

export interface StageCopy {
  plain: string;
  more?: string;
}

export const STAGE_COPY: Record<StageId, StageCopy> = {
  fidelity: {
    plain:
      "Before anything is signed, Alice and each verifier share linked quantum pairs. We measure how well these pairs behave like genuine entangled pairs. That score is fidelity, F.",
    more: "F > 0.5 is the most a non-entangled link can reach, so passing means entanglement is demonstrated. Below that, the session is refused. Impersonation is the only attack stopped here.",
  },
  keys: {
    plain:
      "Alice prepares secret quantum material: for every bit of the encoded message, one bag for '0' and one for '1'. Each bag has 128 slots. Only Alice knows which state is in which slot. It's one-time and destroyed after this run.",
    more: "States come from a six-state set across three bases (Z, X, Y). The bag layout is fixed by the backend so the statistics stay valid.",
  },
  distribute: {
    plain:
      "Alice teleports her secret states to Bob and to Charlie. Each gets their own independent set — Bob can't forward his to Charlie. The two classical 'correction' bits sent along don't reveal the secret.",
    more:
      "Teleportation needs a Bell pair plus two classical bits per state. The receiver uses the classical bits to correct the received state.",
  },
  sign: {
    plain:
      "Alice adds error-correction (BCH) to the message, then opens the matching bag for each bit. The signature is only classical information — the quantum states already sit with Bob and Charlie.",
    more:
      "BCH changes the 39-bit message into 63 encoded positions; any two different messages differ in at least 9 positions, which is what makes message substitution detectable.",
  },
  verify: {
    plain:
      "Before any quantum measurement, the session ledger is checked. Then Bob and Charlie measure their stored qubits against what the signature claims. Measured qubits are consumed — the same material can't be used again.",
    more:
      "The session ledger marks each session ACTIVE or USED: a session can be verified once. A bag passes with fewer than 12 wrong slots out of 128, and all 63 bags must pass.",
  },
  analysis: {
    plain:
      "Reading the evidence: mismatch counts to error rates per basis, fingerprints, classification, root cause, severity.",
    more:
      "Nothing here is AI/ML — every value is computed from the measurement statistics of this run and compared to a fixed library of attack patterns.",
  },
};

/* ------------------------------------------------------------------ *
 *  One-line story per attack — report 10.1 (banner + live caption)
 * ------------------------------------------------------------------ */

export const STORY: Record<string, string> = {
  "no-attack":
    "A normal run: Alice signed, Bob and Charlie both verified, and mismatches stayed at honest-noise levels.",
  forgery:
    "Eve produced a signature without Alice's private quantum information, so the verifiers' measurements disagreed with her claims.",
  impersonation:
    "Eve tried to start a session as Alice but couldn't demonstrate the entangled resource, so the session was refused before any key or signature existed.",
  "replay-used":
    "Eve resent a genuine old transaction; the ledger showed it was already used, so it was rejected before any quantum measurement.",
  "replay-unknown":
    "Eve submitted a session ID the ledger has never authorized, so it was rejected before any quantum measurement.",
  "tampering-fixed-basis":
    "Eve measured every qubit she intercepted with one basis, disturbing two bases heavily and leaving the third almost clean.",
  "tampering-random-basis":
    "Eve guessed a basis for each qubit she intercepted, leaving equal disturbance in all three bases.",
  "tampering-partial":
    "Eve attacked only some slots to stay under the radar, but requiring all 63 bags to pass makes even weak attacks likely to be caught.",
  "tampering-message-substitution":
    "Eve swapped the message after signing, which changed encoded positions, so several bags failed.",
  "tampering-correction-bit":
    "Eve edited the teleportation correction bits, so the verifier rebuilt the wrong states and two bases showed near-total mismatch.",
};

export const storyKey = (attack: string, subtype: string | null): string =>
  attack === "replay" && subtype === null
    ? "replay-used"
    : attack === "tampering"
      ? `tampering-${subtype ?? ""}`
      : attack;

/* ------------------------------------------------------------------ *
 *  Root cause + mitigation library — report 10.2
 * ------------------------------------------------------------------ */

export interface Diagnosis {
  cause: string;
  mitigation: string[];
}

export const DIAGNOSIS: Record<string, Diagnosis> = {
  "no-attack": {
    cause: "No anomaly detected",
    mitigation: ["None required"],
  },
  forgery: {
    cause: "Signature was not produced from Alice's private quantum states",
    mitigation: ["Reject and log", "Investigate where the signature originated"],
  },
  impersonation: {
    cause: "Expected entangled resource not demonstrated at session admission",
    mitigation: [
      "Refuse the session",
      "Verify the requester through an independent channel",
      "Check link/hardware if unexpected",
    ],
  },
  "replay-used": {
    cause: "A previously verified session was resubmitted",
    mitigation: ["Keep sessions single-use", "Alert on repeated USED-session submissions"],
  },
  "replay-unknown": {
    cause: "Session ID never issued by the system",
    mitigation: ["Reject", "Rate-limit and log the source", "Review how the ID was obtained"],
  },
  "tampering-fixed-basis": {
    cause: "Interception at a particular link segment",
    mitigation: ["Inspect the affected physical link"],
  },
  "tampering-random-basis": {
    cause: "Quantum channel interception",
    mitigation: ["Treat the channel as compromised", "Rotate to a fresh key batch"],
  },
  "tampering-partial": {
    cause: "Intermittent interference on selected slots",
    mitigation: [
      "Rotate keys",
      "Increase monitoring",
      "Review repeated near-miss sessions",
    ],
  },
  "tampering-message-substitution": {
    cause: "Message altered after signing",
    mitigation: ["Reject", "Verify message integrity along the delivery path"],
  },
  "tampering-correction-bit": {
    cause: "Teleportation correction information modified on the classical channel",
    mitigation: ["Investigate and authenticate the classical communication layer"],
  },
};

export const diagnosisKey = (attack: string, subtype: string | null): string =>
  attack === "replay" ? `replay-${subtype ?? "used"}` : attack === "tampering" ? `tampering-${subtype ?? "fixed-basis"}` : attack;

/* ------------------------------------------------------------------ *
 *  Fingerprint library — report 10.3 (drives the ghost markers)
 * ------------------------------------------------------------------ */

export interface FingerprintPattern {
  id: string;
  label: string;
  /** error rates for Z, X, Y */
  profile: [number, number, number];
  meaning: string;
}

export const FINGERPRINT_LIBRARY: FingerprintPattern[] = [
  { id: "honest", label: "Honest / normal noise", profile: [0.02, 0.02, 0.02], meaning: "normal noise" },
  { id: "guess", label: "Blind guessing (forgery)", profile: [1 / 2, 1 / 2, 1 / 2], meaning: "blind guessing (forgery-type, no information)" },
  { id: "random", label: "Random-basis intercept-resend", profile: [1 / 3, 1 / 3, 1 / 3], meaning: "random-basis intercept-resend" },
  { id: "fixed", label: "Fixed-basis intercept-resend", profile: [1 / 2, 1 / 2, 0], meaning: "fixed-basis intercept-resend" },
  { id: "correction", label: "Correction-bit tampering", profile: [1, 1, 0], meaning: "correction-bit tampering (two bases high, one near 0)" },
];

/* ------------------------------------------------------------------ *
 *  Honest wording fragments — report 10.4
 * ------------------------------------------------------------------ */

export const HONEST = {
  impersonation:
    "Expected entangled resource not demonstrated; session admission failed. In this simulation, this corresponds to the configured impersonation scenario.",
  bchAtLeast: "BCH guarantees at least 9 changed positions between two different messages.",
  errorCalibration: "example calibration; real hardware would be measured",
  forgingBound: "for a single intercepted copy",
  rootCause: "The most likely explanation, derived from the fingerprint — not proof of who attacked.",
  simulation: "This is a simulation, not physical quantum hardware.",
};