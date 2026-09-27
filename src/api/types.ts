/**
 * Wire types for the QSentinel backend.
 *
 * Rule from the spec: the frontend never calculates thresholds, counts or
 * percentages. Everything numeric in the UI arrives through these shapes.
 * All values here are examples used by the mock backend for layout only.
 */

export type PageId = 1 | 2 | 3 | 4 | 5;

export type ExplainMode = "simple" | "technical";

export type AttackId =
  | "none"
  | "forgery"
  | "impersonation"
  | "replay"
  | "intercept-fixed"
  | "intercept-random"
  | "tampering"
  | "partial";

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
  maxVerifiers: number;
}

export interface KeygenProgress {
  created: number;
  total: number;
  done: boolean;
}

export interface KeygenResponse {
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

export interface DistributeResponse {
  verifiers: VerifierTarget[];
}

export interface ChannelHealthResponse {
  score: number;
  passed: boolean;
  /** gauge banding, read from the backend, not hard-coded in the gauge */
  bands: { failBelow: number; warnBelow: number };
  explanation: string;
}

export interface SignResponse {
  signatureId: string;
  message: string;
  /** one char per encoded block, e.g. "0110…" */
  encoded: string;
  encodedLength: number;
  blocksOpened: number;
  sentTo: string[];
}

export interface EveKnowledge {
  has: string[];
  hasNot: string[];
}

export interface AttackResponse {
  attackId: AttackId;
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
  /** slots tested in this block (for "2 out of 128" style readouts) */
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
  /** immutable snapshot of the whole verifier row after this block */
  result: VerifierResult;
}

export interface Agreement {
  unanimous: boolean;
  verdict: "accepted" | "rejected" | "pending";
  dissenters: string[];
}

export interface FingerprintAxis {
  key: "a" | "b" | "c";
  label: string;
  value: number;
}

export interface FingerprintLegendEntry {
  attackId: AttackId;
  label: string;
  pattern: [number, number, number];
}

export interface AnalyticsPoint {
  x: number;
  y: number;
}

export interface BarComparison {
  labels: string[];
  values: number[];
}

export interface DashboardReport {
  summary: {
    verdict: "accepted" | "rejected";
    attackLabel: string;
    verifierCount: number;
    timestamp: string;
    seed: number;
  };
  security?: SecuritySummary;
  classification: {
    honest: boolean;
    label: string;
    confidence: number;
    explanation: string;
  };
  fingerprint: FingerprintAxis[];
  fingerprintLegend: FingerprintLegendEntry[];
  heatmap: number[];
  channelHealth: number;
  analytics: {
    roc: AnalyticsPoint[];
    rocAxis: { x: string; y: string };
    bars: BarComparison;
  };
  evidenceUrl: string;
}

export interface LogEntry {
  timestamp: string;
  type: string;
  description: string;
}

/* ------------------------------------------------------------------ *
 * Security claims — the three numbers judges will ask for.
 * Optional: a backend that does not report them still renders fine.
 * ------------------------------------------------------------------ */

export interface SecuritySummary {
  /** honest signatures must be accepted with probability 1 */
  honestAcceptanceProbability: number;
  /** empirical forgery success rate at the current block count */
  observedForgeryProbability: number;
  /** the bound the protocol claims, e.g. "≤ 1e-9 per block" */
  claimedForgeryBound: string;
  /** shots sampled to get the numbers above */
  trials: number;
  /** honest runs that produced a false rejection — must be 0 */
  falsePositives: number;
}

/* ------------------------------------------------------------------ *
 * Protocol primitives — feeds the Protocol page (PS: "Key Components").
 * The frontend draws these; it never computes amplitudes or probabilities.
 * ------------------------------------------------------------------ */

/** Pauli operators. I = nothing applied. */
export type PauliOperator = "I" | "X" | "Y" | "Z";

/** Measurement basis. Z is the computational basis, X/Y are superposition. */
export type MeasurementBasis = "X" | "Y" | "Z";

export interface Complex {
  re: number;
  im: number;
}

/** Squared magnitude of an amplitude, in [0, 1]. Sum over a state = 1. */
export interface Amplitude {
  label: string;
  re: number;
  im: number;
  /** |amplitude|^2, sent precomputed so the UI never squares anything */
  probability: number;
}

export interface BellStateResponse {
  /** e.g. "|Φ+⟩ = (|00⟩ + |11⟩)/√2" */
  formula: string;
  label: string;
  /** the four computational-basis labels: "00", "01", "10", "11" */
  basis: string[];
  amplitudes: Amplitude[];
  /** measured pairs and how often they agreed — the entanglement evidence */
  correlationTrials: number;
  correlationAgreement: number;
}

export interface TeleportStep {
  index: number;
  /** short machine name, e.g. "measure" | "classify" | "correct" */
  stage: "prepare" | "share" | "measure" | "classify" | "correct" | "done";
  caption: string;
  detail: string;
  /** the two classical bits Alice sends Bob */
  classicalBits: string;
  /** operator Bob applies as a result */
  correction: PauliOperator;
  /** state after this step, for the state panel */
  amplitudes: Amplitude[];
}

export interface TeleportTrace {
  /** the payload qubit, e.g. |ψ⟩ */
  inputState: string;
  steps: TeleportStep[];
  /** Bob's state equals the input state exactly — true, not asserted by the UI */
  statePreserved: boolean;
}

export interface MeasurementSeries {
  id: string;
  title: string;
  basis: MeasurementBasis;
  /** one bin per outcome, e.g. 8 shots */
  shots: number;
  bins: { outcome: string; count: number }[];
  /** the distribution a legitimate run must match */
  expected: number[];
  /** statistical deviation, 0 = perfect match */
  deviation: number;
  verdict: "match" | "deviant";
}

export interface ForgeryPoint {
  blocks: number;
  /** empirical success rate at this block count */
  probability: number;
}

export interface ForgeryCurve {
  points: ForgeryPoint[];
  bound: string;
  trialsPerPoint: number;
}

/* ------------------------------------------------------------------ *
 * Evidence export
 * ------------------------------------------------------------------ */

export interface EvidenceReport {
  generator: string;
  problemStatement: string;
  exportedAt: string;
  run: DashboardReport;
  security?: SecuritySummary;
  /** hash chain over the log, so the export is tamper-evident */
  logChain: { length: number; head: string };
}

