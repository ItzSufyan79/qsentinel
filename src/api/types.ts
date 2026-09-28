/**
 * Wire types for the QSentinel backend.
 *
 * Contract source: UI/UX design report, section 11 (data contract) — keep
 * field names consistent (fidelity_test, not channel_health; bag, not block).
 * Every component that displays live or historical data is mapped to one of
 * these shapes. If a component has no endpoint, it is static.
 *
 * HARD RULE (from the problem statement): the frontend never calculates a
 * threshold, a count, a percentage, a probability or a verdict. Every number
 * the UI displays arrives in one of these shapes. A field that the backend did
 * not supply is `null` and renders as the report's "Not run" card — the UI
 * never fills it in itself.
 */

import type { IconName } from "../lib/iconNames";

/* ------------------------------------------------------------------ *
 *  Attack model — the report's five cards + five tampering sub-types
 * ------------------------------------------------------------------ */

export type AttackTypeId =
  | "no-attack"
  | "forgery"
  | "impersonation"
  | "replay"
  | "tampering";

export type TamperingSubtype =
  | "fixed-basis"
  | "random-basis"
  | "partial"
  | "message-substitution"
  | "correction-bit";

/** Replay is caught at the session ledger, before any quantum measurement. */
export type ReplayType = "used" | "unknown";

export type TargetLink = "bob" | "charlie" | "both";

export type VerifierName = "bob" | "charlie";

export interface AttackOption {
  id: AttackTypeId;
  label: string;
  /** one plain line, from report section 5.2 */
  description: string;
  icon: IconName;
  /** the hint chip on the card, report 5.2 — e.g. "Stopped at: Fidelity Test" */
  hint: string;
  /** report 3.3 */
  injectedAt: string;
  caughtAt: string;
}

export const ATTACK_OPTIONS: AttackOption[] = [
  {
    id: "no-attack",
    label: "No attack",
    description: "A normal run. See what \"healthy\" looks like.",
    icon: "shield-check",
    hint: "All checks pass",
    injectedAt: "—",
    caughtAt: "—",
  },
  {
    id: "forgery",
    label: "Forgery",
    description: "Eve signs something Alice never signed.",
    icon: "alert-triangle",
    hint: "Caught at: bag threshold (Bob & Charlie)",
    injectedAt: "Between signing and verification",
    caughtAt: "Bag threshold at Bob and Charlie",
  },
  {
    id: "impersonation",
    label: "Impersonation",
    description: "Eve claims to be Alice from the start.",
    icon: "eye",
    hint: "Stopped at: Fidelity Test",
    injectedAt: "Stage 1 (session admission)",
    caughtAt: "Fidelity Test",
  },
  {
    id: "replay",
    label: "Replay",
    description: "Eve resends an old, genuine transaction.",
    icon: "list-details",
    hint: "Stopped at: session ledger lookup",
    injectedAt: "Stage 5 entry",
    caughtAt: "Session ledger lookup",
  },
  {
    id: "tampering",
    label: "Tampering",
    description:
      "Eve interferes with quantum states, the message, or teleportation data.",
    icon: "atom",
    hint: "Caught at: bag threshold + fingerprint",
    injectedAt: "Depends on sub-type",
    caughtAt: "Bag threshold + fingerprint",
  },
];

export interface TamperOption {
  id: TamperingSubtype;
  label: string;
  description: string;
  icon: IconName;
  /** report 3.3 + 10.1 */
  injectedAt: string;
  caughtAt: string;
  /** short fingerprint description used on cards and preview */
  fingerprint: string;
}

export const TAMPER_OPTIONS: TamperOption[] = [
  {
    id: "fixed-basis",
    label: "Fixed-basis intercept-resend",
    description: "Eve always measures with the same basis.",
    icon: "atom",
    injectedAt: "Quantum link, before measurement",
    caughtAt: "Bag threshold + fingerprint",
    fingerprint: "two bases ≈ 1/2, one ≈ 0",
  },
  {
    id: "random-basis",
    label: "Random-basis intercept-resend",
    description: "Eve guesses a basis for each qubit.",
    icon: "atom",
    injectedAt: "Quantum link, before measurement",
    caughtAt: "Bag threshold + fingerprint",
    fingerprint: "all three bases ≈ 1/3",
  },
  {
    id: "partial",
    label: "Partial / stealth",
    description: "Eve attacks only some slots to stay quiet.",
    icon: "activity",
    injectedAt: "Quantum link, before measurement",
    caughtAt: "Bag threshold + heatmap + detection curve",
    fingerprint: "diluted version of a pattern",
  },
  {
    id: "message-substitution",
    label: "Message substitution",
    description: "Eve swaps the message after signing.",
    icon: "arrows-diff",
    injectedAt: "Classical channel, after signing",
    caughtAt: "Bag threshold + BCH-diff heatmap",
    fingerprint: "several bags fail at changed positions",
  },
  {
    id: "correction-bit",
    label: "Classical correction-bit tampering",
    description: "Eve alters the teleportation correction bits.",
    icon: "lock",
    injectedAt: "Classical link during teleportation (stage 3)",
    caughtAt: "Bag threshold + fingerprint",
    fingerprint: "two bases ≈ 1, one ≈ 0",
  },
];

export const attackLabel = (id: AttackTypeId): string =>
  ATTACK_OPTIONS.find((a) => a.id === id)?.label ?? id;

export const tamperingLabel = (id: TamperingSubtype): string =>
  TAMPER_OPTIONS.find((t) => t.id === id)?.label ?? id;

/** The pipeline where an attack stops and immediately routes to Results. */
export type BlockedWhere = "fidelity" | "ledger" | "verification";

/* ------------------------------------------------------------------ *
 *  Pipeline
 * ------------------------------------------------------------------ */

export type StageId =
  | "fidelity"
  | "keys"
  | "distribute"
  | "sign"
  | "verify"
  | "analysis";

export const STAGES: { id: StageId; num: 1 | 2 | 3 | 4 | 5 | 6; label: string }[] = [
  { id: "fidelity", num: 1, label: "Session & Fidelity Test" },
  { id: "keys", num: 2, label: "Private keys" },
  { id: "distribute", num: 3, label: "Distribution" },
  { id: "sign", num: 4, label: "Signing" },
  { id: "verify", num: 5, label: "Verification" },
  { id: "analysis", num: 6, label: "Analysis" },
];

/* ------------------------------------------------------------------ *
 *  The only things the user controls (report 5.3). Everything else is
 *  backend-controlled and shown read-only with a lock icon.
 * ------------------------------------------------------------------ */

export interface RunConfig {
  attack: AttackTypeId;
  subtype: TamperingSubtype | null;
  /** required, ≤ 64 chars */
  message: string;
  /** message substitution only */
  tamperedMessage: string | null;
  targetLink: TargetLink | null;
  /** fixed-basis intercept-resend only */
  fixedBasis: "Z" | "X" | "Y" | null;
  /** partial / stealth only, 5–100 step 5, default 25 */
  intensityPct: number | null;
  /** replay only */
  replayType: ReplayType | null;
}

/** POST /api/runs -> { session_id } (report 11). */
export interface CreateRunResponse {
  session_id: string;
  seed: number;
  /** backend echo of the config, stored for reproducibility */
  config: RunConfig;
}

/** POST /api/runs/{id}/rerun -> { session_id } — same settings, new session. */
export interface RerunResponse {
  session_id: string;
  seed: number;
}

/* ------------------------------------------------------------------ *
 *  Live lifecycle — GET /api/runs/{id}/events (server-sent events)
 *
 *  One frame per emitted event; the page buffers them and drives its own
 *  playback. No frame ever carries secret key material.
 * ------------------------------------------------------------------ */

export type EvActor = "alice" | "bob" | "charlie" | "eve" | "system";

export interface EventBase {
  /** milliseconds since the start of the run */
  tMs: number;
}

export interface SessionEvent extends EventBase {
  kind: "session";
  sessionId: string;
  seed: number;
  message: string;
}

export interface FidelityEvent extends EventBase {
  kind: "fidelity";
  F: number;
  gate: number;
  passed: boolean;
  /** impersonation only — the resource Eve supplied is not genuine */
  referenceFake: boolean;
}

export interface KeysEvent extends EventBase {
  kind: "keys";
  /** the 63-codebit string, one char per bag (mono display) */
  bits: string;
  /** marker for the bag zoom: bag opened at this index (0–62) */
  openedBags: number[];
}

export interface DistributeEvent extends EventBase {
  kind: "distribute";
  /** which independent set is delivered */
  set: "a" | "b";
  /** correction bits shown for the correction-bit scenario */
  correction: { sent: string; received: string; flipped: boolean } | null;
}

export interface SignEvent extends EventBase {
  kind: "sign";
  message: string;
  digest: string;
  bits: string;
}

export interface InjectEvent extends EventBase {
  kind: "inject";
  attack: string;
  subtype: string | null;
  target: TargetLink | null;
  /** partial / stealth only */
  slotsAttacked: number | null;
  slotsTotal: number | null;
  /** message substitution only */
  tamperedMessage: string | null;
  /** correction-bit only */
  correctionFlipped: string | null;
}

export interface LedgerEvent extends EventBase {
  kind: "ledger";
  queriedId: string;
  found: boolean;
  status: "ACTIVE" | "USED" | null;
  /** true when the run stops right here (replay attacks) */
  stop: boolean;
}

export interface VerifyBagEvent extends EventBase {
  kind: "verify-bag";
  verifier: VerifierName;
  bagIndex: number;
  wrong: number;
  passLine: number;
  fail: boolean;
  checked: number;
}

export interface VerifyDoneEvent extends EventBase {
  kind: "verify-done";
  verifier: VerifierName;
  passed: number;
  failed: number;
  verdict: "ACCEPTED" | "REJECTED";
  rates: { Z: number; X: number; Y: number };
}

export interface AnalysisEvent extends EventBase {
  kind: "analysis";
  step: number;
  label: string;
}

export interface LogEvent extends EventBase {
  kind: "log";
  stage: StageId;
  actor: EvActor;
  code: string;
  level: "info" | "check" | "attack";
  message: string;
  payload?: unknown;
}

export interface DoneEvent extends EventBase {
  kind: "done";
  sessionId: string;
}

export type RunEvent =
  | SessionEvent
  | FidelityEvent
  | KeysEvent
  | DistributeEvent
  | SignEvent
  | InjectEvent
  | LedgerEvent
  | VerifyBagEvent
  | VerifyDoneEvent
  | AnalysisEvent
  | LogEvent
  | DoneEvent;

/* ------------------------------------------------------------------ *
 *  Logs — GET /api/runs/{id}/logs?stage=&actor=&level=&q=
 * ------------------------------------------------------------------ */

export type LogActor = "alice" | "bob" | "charlie" | "eve" | "system";
export type LogLevel = "info" | "check" | "attack";

export interface LogRow {
  timeMs: number;
  stage: StageId;
  actor: LogActor;
  code: string;
  level: LogLevel;
  message: string;
  /** raw event fragment, shown when the row is expanded */
  payload?: unknown;
}

export interface LogFilters {
  stage?: StageId | "all";
  actor?: LogActor | "all";
  level?: LogLevel | "all";
  q?: string;
}

/* ------------------------------------------------------------------ *
 *  Result — GET /api/runs/{id}/result (report 7 + 11)
 * ------------------------------------------------------------------ */

export type Verdict = "ACCEPTED" | "REJECTED";

export interface VerifierReport {
  verdict: "ACCEPTED" | "REJECTED" | "NOT RUN";
  /** 63 wrong-slot counts, one per bag — the heatmap and distribution */
  bagsWrong: number[] | null;
  rates: { Z: number; X: number; Y: number } | null;
  passed: number;
  failed: number;
  worstBag: { index: number; wrong: number } | null;
}

export interface ResultEnvelope {
  severity: { score: number; confidencePart: number; deviationPart: number; categoryPart: number };
  fidelityTest: {
    F: number;
    gate: number;
    referenceFake: boolean;
    passed: boolean;
    failReason: string | null;
  } | null;
  /** replay only */
  ledger: {
    queriedId: string;
    found: boolean;
    status: "ACTIVE" | "USED" | null;
    reason: string;
  } | null;
  verifiers: { bob: VerifierReport; charlie: VerifierReport };
  agreement: { consistent: boolean; reason: string } | null;
  fingerprintMatch: {
    best: string;
    bestLabel: string;
    distance: number;
    runnerUp: string;
    runnerUpLabel: string;
    runnerUpDistance: number;
    /** distance to every library pattern, for the compact library table */
    library: { id: string; label: string; distance: number; profile: number[] }[];
  } | null;
  /** three-step reasoning chain with this run's real numbers, report 7.3 */
  why: { label: string; detail: string; chart: string }[];
  attackConfig: {
    attack: string;
    subtype: string | null;
    targetLink: TargetLink | null;
    basis: string | null;
    intensityPct: number | null;
    slotsAttacked: number | null;
    slotsTotal: number;
    tamperedMessage: string | null;
    correctionMutation: string | null;
    replayType: string | null;
    injectedBetween: string;
    caughtBy: string;
  };
  /** message substitution only */
  bchDiff: {
    k: number;
    changedPositions: number[];
    changed: boolean[];
  } | null;
  /** correction-bit only */
  correctionBits: {
    sent: string;
    received: string;
    convention: string;
  } | null;
  /** partial / stealth only */
  detectionCurve: {
    intensities: number[];
    perBag: number[];
    signature: number[];
    chosenIndex: number;
    perBagAt: number;
    signatureAt: number;
  } | null;
  /** backend-computed binomial evidence for the run's N (report 7.4) */
  bagDistribution: {
    n: number;
    passLine: number;
    pHonest: number;
    pCheat: number;
    falseRejection: number;
    falseAcceptance: number;
  } | null;
}

export interface ResultResponse {
  sessionId: string;
  seed: number;
  message: string;
  verdict: Verdict;
  classification: string;
  /** 0–1; the banner shows it as a percentage */
  confidence: number;
  verdictBanner: ResultEnvelope;
  /** report 7.3 */
  attackPath: { injected: string; caught: string };
  /** the one-sentence story for the banner, from report 10.1 */
  story: string;
  stoppedAt: StageId | null;
  injectedAt: StageId | null;
}

/* ------------------------------------------------------------------ *
 *  Analytics — GET /api/analysis/binomial (report 11) and /history
 * ------------------------------------------------------------------ */

export interface BinomialResponse {
  n: number;
  pHonest: number;
  pCheat: number;
  passLine: number;
  /** x = 0..n */
  x: number[];
  honest: number[];
  cheater: number[];
  falseRejection: number;
  falseAcceptance: number;
}

export interface HistoryRow {
  sessionId: string;
  timestamp: string;
  attack: string;
  subtype: string | null;
  targetLink: TargetLink | null;
  verdict: Verdict;
  severity: number;
}

/** GET /api/history */
export interface HistoryResponse {
  runs: HistoryRow[];
  /** per-attack detection summary, report 8 */
  byAttack: {
    attack: string;
    runs: number;
    detected: number;
    meanSeverity: number;
  }[];
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