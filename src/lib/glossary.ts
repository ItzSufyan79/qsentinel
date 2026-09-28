/**
 * Glossary — Appendix A of the design report. Shown both as inline `Term`
 * tooltips and in the top-bar slide-over.
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Qubit",
    definition:
      "The smallest unit of quantum information; measuring it changes it.",
  },
  {
    term: "Bell pair",
    definition:
      "Two qubits linked so their measurement results are correlated; used to build trust between Alice and each verifier.",
  },
  {
    term: "Fidelity (F)",
    definition:
      "A 0–1 score of how closely a pair of linked qubits behaves like a genuine Bell pair.",
  },
  {
    term: "Fidelity Test",
    definition:
      "The first check: measures F and refuses the session if F ≤ 0.5. Authenticates the sender.",
  },
  {
    term: "Basis (Z, X, Y)",
    definition:
      "The \"question\" you ask a qubit when measuring. Right question → predictable answer; wrong question → random answer.",
  },
  {
    term: "Slot",
    definition: "One quantum state inside a bag.",
  },
  {
    term: "Bag",
    definition:
      "128 slots. Each encoded bit has a 0-bag and a 1-bag; signing opens one of them.",
  },
  {
    term: "Teleportation",
    definition:
      "Moving a quantum state to a distant party using a Bell pair plus two classical bits.",
  },
  {
    term: "Correction bits",
    definition:
      "The two classical bits the receiver needs to finish teleportation.",
  },
  {
    term: "BCH code",
    definition:
      "Error-correcting encoding (39 → 63 bits) that makes different messages differ in at least 9 positions.",
  },
  {
    term: "Verifier",
    definition:
      "A party who checks the signature. There are exactly two: Bob and Charlie.",
  },
  {
    term: "Threshold / pass line",
    definition:
      "A bag passes if it has fewer than 12 wrong slots out of 128.",
  },
  {
    term: "Fingerprint",
    definition:
      "The pattern of wrong-answer rates in Z, X and Y that a given attack leaves behind.",
  },
  {
    term: "Session ledger",
    definition:
      "The record of sessions: ACTIVE (can verify), USED (already verified).",
  },
  {
    term: "Replay",
    definition: "Re-sending a genuine old transaction.",
  },
  {
    term: "Intercept-resend",
    definition: "Eve measures a qubit and sends a replacement onward.",
  },
  {
    term: "Severity score",
    definition: "A 0–10 project-specific rating of an incident.",
  },
];

export const glossaryTerm = (term: string): GlossaryEntry | undefined =>
  GLOSSARY.find((g) => g.term.toLowerCase() === term.toLowerCase());