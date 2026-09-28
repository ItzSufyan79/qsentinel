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

import type { ReactNode } from "react";

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
  /** true for the attacks that interpose a node on the quantum channel */
  intercepts: boolean;
  hasIntensity: boolean;
}

export const ATTACK_OPTIONS: AttackOption[] = [
  {
    id: "honest",
    label: "Honest baseline",
    description: "No adversary. Establishes the error-rate floor every other run is judged against.",
    intercepts: false,
    hasIntensity: false,
  },
  {
    id: "forgery",
    label: "Forgery",
    description: "Signs a different message with a mismatched key. Hits the signing phase.",
    intercepts: false,
    hasIntensity: false,
  },
  {
    id: "impersonation",
    label: "Impersonation",
    description: "A party with no key material claims to be the sender. Hits the signing phase.",
    intercepts: false,
    hasIntensity: false,
  },
  {
    id: "replay",
    label: "Intercept-resend replay",
    description: "Replays a previously captured signature. Freshness checks fail across the block set.",
    intercepts: true,
    hasIntensity: false,
  },
  {
    id: "intercept-fixed",
    label: "Fixed-basis intercept",
    description: "Measures every state in one fixed basis. Errors cluster where that basis disagreed.",
    intercepts: true,
    hasIntensity: false,
  },
  {
    id: "intercept-random",
    label: "Random-basis stealth intercept",
    description: "Measures in a random basis each time. Produces a scattered, low-density error pattern.",
    intercepts: true,
    hasIntensity: false,
  },
  {
    id: "partial",
    label: "Partial / stealth intercept",
    description: "Alters only a fraction of the transmitted data. Intensity controls how much.",
    intercepts: true,
    hasIntensity: true,
  },
  {
    id: "tampering",
    label: "Classical channel tampering",
    description: "Alters the Pauli correction step in transit. Produces a periodic error signature.",
    intercepts: true,
    hasIntensity: false,
  },
  {
    id: "collusion",
    label: "Verifier collusion",
    description: "Two verifiers report conflicting outcomes. Routed to the Arbitration page.",
    intercepts: false,
    hasIntensity: false,
  },
];

export const attackLabel = (id: AttackTypeId): string =>
  ATTACK_OPTIONS.find((a) => a.id === id)?.label ?? id;

/* ------------------------------------------------------------------ *
 *  Shared domain types
 * ------------------------------------------------------------------ */

export type Verdict = "accepted" | "rejected";
export type BlockStatus = "pending" | "pass" | "fail";

export interface Stat {
  label: string;
  value: string;
}

export interface InitResponse {
  runId: string;
  seed: number;
  hardwareProfile: { label: string; stats: Stat[] };
  verifierCountOptions: number[];
}

/** GET /api/simulate/preview */
export interface PreviewResponse {
  attackType: AttackTypeId;
  n: number;
  threshold: number;
  /** predicted detection confidence at this N, so the preview is never blank */
  predictedDetectionConfidence: number;
}

/** POST /api/simulate/run */
export interface RunResponse {
  runId: string;
  attackType: AttackTypeId;
  n: number;
  threshold: number;
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

export interface EveKnowledge {
  has: string[];
  hasNot: string[];
}

/** Attack detail, echoed by the signing/verification endpoints. */
export interface AttackResponse {
  attackType: AttackTypeId;
  label: string;
  intensity: number | null;
  /** which animation the Eve node should play */
  visualization: "idle" | "grab" | "swap" | "alter" | "reuse";
  eve: EveKnowledge;
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
  verdict: "pending" | "accepted" | "rejected";
}

export interface VerifyEvent {
  verifier: string;
  block: BlockResult;
  checked: number;
  result: VerifierResult;
}

/** GET /api/simulate/{run_id}/result */
export interface ResultResponse {
  runId: string;
  verdict: Verdict;
  /** observed mismatch rate across all verified blocks */
  mismatchRate: number;
  threshold: number;
  /** p-value style: "this error rate has a 1-in-X chance under an honest run" */
  confidence: string;
  flaggedBy: "quantum-error-rate" | "classical-mac" | "verifier-cross-check" | "none";
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
  active: boolean;
  runId: string | null;
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
  flaggedBy: string;
  detected: boolean;
}

/** GET /api/log */
export interface LogPage {
  entries: LogEntry[];
  page: number;
  totalPages: number;
  total: number;
}

/* ------------------------------------------------------------------ *
 *  Error shape
 * ------------------------------------------------------------------ */

export type ApiErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "ABORTED"
  | "RUN_NOT_FOUND"
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

/* ------------------------------------------------------------------ *
 *  Small shared UI helpers
 * ------------------------------------------------------------------ */

export type IconName = ReactNode;
