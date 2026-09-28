/**
 * Wire types for the QSentinel backend.
 *
 * Contract source: UI/UX design report, section 6 (data contract summary).
 * Every component that displays live or historical data is mapped to one of
 * these endpoints. If a component has no endpoint, it is static.
 *
 * HARD RULE (from the problem statement): the frontend never calculates a
 * threshold, a count, a percentage, a probability or a verdict. Every number
 * the UI displays arrives in one of these shapes.
 */

import type { IconName } from "../lib/iconNames";

/* ------------------------------------------------------------------ *
 *  Attack model — the nine options from spec section 4.2
 * ------------------------------------------------------------------ */

export type AttackTypeId =
  | "honest"
  | "forgery"
  | "impersonation"
  | "replay"
  | "intercept-fixed"
  | "intercept-random"
  | "partial"
  | "tampering"
  | "collusion";

export interface AttackOption {
  id: AttackTypeId;
  label: string;
  /** one line: what it does and which phase it hits (static lookup) */
  description: string;
  /** the Tabler concept that represents this scenario in the UI */
  icon: IconName;
  /** true for the attacks that interpose a node on the quantum channel */
  intercepts: boolean;
  /** true when the scenario has an attack-fraction control */
  hasIntensity: boolean;
  /** the backend requires at least this many verifiers for this scenario */
  minVerifiers: number;
}

export const ATTACK_OPTIONS: AttackOption[] = [
  {
    id: "honest",
    label: "Honest baseline",
    description:
      "No adversary. Establishes the error-rate floor that every other run is judged against.",
    icon: "shield-check",
    intercepts: false,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "forgery",
    label: "Forgery",
    description:
      "Signatures a different message with key material that does not match the one the verifiers hold.",
    icon: "alert-triangle",
    intercepts: false,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "impersonation",
    label: "Impersonation",
    description:
      "A party with no legitimate key half claims to be the signer and produces a signature anyway.",
    icon: "eye",
    intercepts: false,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "replay",
    label: "Replay",
    description:
      "Replays a previously valid transmission. Detected by nonce and session validation, not by intercept-resend.",
    icon: "list-details",
    intercepts: false,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "intercept-fixed",
    label: "Fixed-basis intercept-resend",
    description:
      "Measures every transmitted state in one fixed basis. Errors cluster where that basis disagreed.",
    icon: "atom",
    intercepts: true,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "intercept-random",
    label: "Random-basis intercept-resend",
    description:
      "Chooses a measurement basis at random per state, spreading the induced error across both bases.",
    icon: "atom",
    intercepts: true,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "partial",
    label: "Partial / stealth intercept",
    description:
      "Attacks only a fraction of the transmitted qubits. A small enough fraction can stay below the detection threshold.",
    icon: "activity",
    intercepts: true,
    hasIntensity: true,
    minVerifiers: 1,
  },
  {
    id: "tampering",
    label: "Classical channel tampering",
    description:
      "Modifies the classical data in transit. Rejected by the MAC check before quantum verification matters.",
    icon: "lock",
    intercepts: false,
    hasIntensity: false,
    minVerifiers: 1,
  },
  {
    id: "collusion",
    label: "Verifier collusion",
    description:
      "Two verifiers report conflicting outcomes for the same signature, so the run is routed to arbitration.",
    icon: "scale",
    intercepts: false,
    hasIntensity: false,
    minVerifiers: 2,
  },
];

export const attackLabel = (id: AttackTypeId): string =>
  ATTACK_OPTIONS.find((a) => a.id === id)?.label ?? id;

/* ------------------------------------------------------------------ *
 *  Shared domain types
 * ------------------------------------------------------------------ */

export type Verdict = "accepted" | "rejected";
export type BlockStatus = "pending" | "pass" | "fail";
/** a verifier that has not finished reporting is still "pending", not a verdict */
export type VerifierVerdict = "pending" | Verdict;

/** GET /api/simulate/preview */
export interface PreviewResponse {
  attackType: AttackTypeId;
  noise: number;
  qubitsPerSlot: number;
  verifierCount: number;
  /** the threshold the backend would derive for this configuration */
  threshold: number;
  thresholdSource: ThresholdSource;
  /** null when the backend has no prediction for this configuration */
  predictedDetectionConfidence: number | null;
  /** backend-declared valid ranges, so the UI never hardcodes a limit */
  supported: {
    noise: { min: number; max: number; default: number; step: number };
    qubitsPerSlot: { min: number; max: number; default: number; step: number };
    verifierCount: { min: number; max: number; default: number };
  };
}

/**
 * The user-controlled configuration. Only these fields are sent to the backend —
 * everything else in a QDS run (bases, Bell pairs, nonces, MAC key, seed) is
 * generated server-side.
 */
export interface SimulationParameters {
  attackType: AttackTypeId;
  /** channel noise as a fraction, e.g. 0.02 for 2% */
  noise: number;
  qubitsPerSlot: number;
  verifierCount: number;
  /** partial / stealth intercept only; fraction of qubits attacked, 0–1 */
  attackFraction?: number;
  /** only sent when the user overrides the backend-derived threshold */
  thresholdOverride?: number;
}

export type ThresholdSource = "derived" | "override";

/** POST /api/simulate/run */
export interface RunResponse {
  runId: string;
  attackType: AttackTypeId;
  noise: number;
  qubitsPerSlot: number;
  verifierCount: number;
  attackFraction: number | null;
  /** always backend-supplied, whether derived or overridden */
  threshold: number;
  thresholdSource: ThresholdSource;
  /** the backend stores this so a run can be reproduced */
  seed: number;
}

export interface KeygenResponse {
  runId: string;
  totalSlots: number;
  slotsPerBlock: number;
  blocks: number;
  bagsPerPosition: number;
  codewordPositions: number;
}

export interface VerifierTarget {
  name: string;
  received: number;
  total: number;
  done: boolean;
}

/** GET /api/simulate/{run_id}/distribution */
export interface DistributionResponse {
  runId: string;
  verifiers: VerifierTarget[];
}

/** GET /api/simulate/{run_id}/signing */
export interface SignResponse {
  runId: string;
  signatureId: string;
  message: string;
  /** one char per encoded block, e.g. "0110…" */
  encoded: string;
  encodedLength: number;
  blocksOpened: number;
  sentTo: string[];
  /** the attack this run is subject to, so the channel can show an attacker */
  attackType: AttackTypeId;
  /** true when the attack interposes a node on the quantum channel */
  intercepts: boolean;
}

export interface BlockResult {
  index: number;
  mismatches: number;
  threshold: number;
  slotCount: number;
  status: BlockStatus;
}

export interface VerifierResult {
  name: string;
  checked: number;
  total: number;
  failed: number;
  verdict: VerifierVerdict;
}

export interface VerifyEvent {
  verifier: string;
  block: BlockResult;
  checked: number;
  result: VerifierResult;
}

/**
 * Which check rejected the run. The backend picks this; the frontend never
 * infers a mechanism from the attack type.
 */
export type DetectionMechanism =
  | "quantum-error-rate"
  | "classical-mac"
  | "nonce-session-validation"
  | "verifier-cross-check"
  | "none";

/** Overall outcome as reported by the backend. */
export type DetectionStatus = "detected" | "not-detected";

/** Per-basis error breakdown, returned by the intercept-resend scenarios. */
export interface BasisBreakdown {
  zBasisMismatch: number;
  xBasisMismatch: number;
  zBasisSamples: number;
  xBasisSamples: number;
}

/**
 * Ground-truth difference for a non-honest run. Every field is optional
 * because each scenario has its own evidence; the UI renders only what came
 * back. No key material is ever carried here.
 */
export interface AttackEvidence {
  /** qubits the attacker actually touched, when the backend counts them */
  affectedQubits?: number;
  /** fraction of qubits attacked, partial / stealth only */
  attackFraction?: number;
  /** expected vs observed error density, when measured */
  expectedMismatchRate?: number;
  /** intercept-resend only */
  basisBreakdown?: BasisBreakdown;
  /** replay only */
  originalRunId?: string;
  nonceStatus?: "reused" | "fresh" | "unknown";
  nonceValue?: string;
  /** classical tampering only */
  macStatus?: "verified" | "failed" | "not-checked";
  tamperedField?: string;
  /** collusion only */
  crossCheckStatus?: "matched" | "diverged";
  verifierDivergence?: number;
  /** short sentences the backend attaches to this specific run */
  notes?: string[];
}

/** GET /api/simulate/{run_id}/result */
export interface ResultResponse {
  runId: string;
  attackType: AttackTypeId;
  /** "detected" when an attack was flagged; "not-detected" when it slipped through */
  detectionStatus: DetectionStatus;
  /** per-verifier outcome, kept separate from the run-level status */
  verdict: Verdict;
  /** observed mismatch rate across all verified blocks */
  mismatchRate: number;
  threshold: number;
  thresholdSource: ThresholdSource;
  /** null unless the backend computes a statistic for this run */
  confidence: string | null;
  flaggedBy: DetectionMechanism;
  evidence: AttackEvidence;
  /** true only when verifiers disagreed — gates the Arbitration link */
  arbitrationAvailable: boolean;
  /** what the attacker changed vs. what the signer sent — only when not honest */
  flaggedDiff?: { sent: string; received: string }[];
  verifiers: VerifierResult[];
  /** plain-language explanation of what the attack did */
  rootCause: string;
  /** how the framework contained or rejected it */
  mitigation: string;
  /** 0–100, derived from mismatch rate, threshold margin and attack type */
  severityScore: number;
}

/** GET /api/simulate/{run_id}/arbitration */
export interface ArbitrationResponse {
  runId: string;
  verifiers: {
    name: string;
    mismatchRate: number;
    verdict: Verdict;
    timestamp: string;
  }[];
  crossCheckStatus: "matched" | "diverged";
  arbiterRuling: string;
}

/** GET /api/simulate/active — polled by the global nav badge */
export interface ActiveResponse {
  status: "none" | "running" | "completed" | "disputed";
  runId: string | null;
  /** the phase the run is in, when one is active */
  phase: string | null;
}

/* ------------------------------------------------------------------ *
 *  Analytics dashboard
 * ------------------------------------------------------------------ */

/** GET /api/stats/summary */
export interface StatsSummary {
  totalRuns: number;
  detectionRate: number;
  avgMismatchHonest: number;
  avgMismatchAttacked: number;
  /**
   * Share of runs in which every verifier reached the same verdict. Optional:
   * a backend that does not track agreement omits it, and the dashboard shows
   * "not reported" rather than inventing a number.
   */
  verifierAgreementRate?: number;
}

/** GET /api/stats/by-attack-type */
export interface ByAttackTypeRow {
  attackType: AttackTypeId;
  label: string;
  runs: number;
  detected: number;
  detectionRate: number;
}

/** GET /api/stats/histogram */
export interface HistogramResponse {
  bins: string[];
  honest: number[];
  attacked: number[];
}

/** GET /api/stats/forgery-comparison */
export interface ForgeryComparison {
  /** classical RSA/ECC forgery probability at equivalent security */
  classical: number;
  quantum: number;
  classicalLabel: string;
  quantumLabel: string;
}

/* ------------------------------------------------------------------ *
 *  Event log
 * ------------------------------------------------------------------ */

export interface LogEntry {
  timestamp: string;
  attackType: AttackTypeId;
  label: string;
  runId: string;
  verdict: Verdict;
  flaggedBy: DetectionMechanism;
  detected: boolean;
  /** ISO date, so the log view can offer a date filter */
  date: string;
}

/** GET /api/log */
export interface LogPage {
  entries: LogEntry[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * Optional refinements for the log endpoints. Sent only when set, so a backend
 * that has not implemented them still answers with the unfiltered page.
 */
export interface LogQuery {
  /** "accepted" | "rejected" | "all" */
  verdict?: Verdict | "all";
  /** ISO date, e.g. "2026-09-28" */
  date?: string;
  /** free text matched against the run id, label and flagged_by */
  search?: string;
}

/* ------------------------------------------------------------------ *
 *  Error shape
 * ------------------------------------------------------------------ */

export type ApiErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "ABORTED"
  | "RUN_NOT_FOUND"
  | "INVALID_PARAMS"
  | "INVALID_STATE"
  | "CHANNEL_UNTRUSTED"
  | "BACKEND_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: ApiErrorCode, message: string, status = 0, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
