/**
 * QSentinel backend contract — SIH PS 26141.
 *
 * This file is the hand-off point between the frontend and the quantum team.
 * Nothing in `src/components` or `src/pages` talks to the network directly:
 * they consume `api` from `src/api/index.ts`, which is typed as `QdsApi`.
 *
 * Implement the twelve methods below and the frontend works, unchanged.
 *
 * ------------------------------------------------------------------
 * HARD RULE (from the problem statement)
 * ------------------------------------------------------------------
 * The frontend never computes a threshold, a count, a percentage, a
 * probability or a verdict. Every number the UI displays arrives in one of
 * these shapes. If a value is missing from a response, it does not exist in
 * the product — do not derive it in React.
 *
 * ------------------------------------------------------------------
 * RULES
 * ------------------------------------------------------------------
 * 1. Every response is JSON and matches `src/api/types.ts` exactly.
 * 2. `seed` is authoritative. Same seed + same inputs => byte-identical run.
 *    The frontend exposes the seed in the URL so any run is reproducible.
 * 3. Long work is streamed (SSE), never polled. The demo runs live.
 * 4. Failures use the `ApiError` shape with a real `code`, so the UI can show
 *    a specific message instead of "something went wrong".
 * 5. All values are finite numbers. No `NaN`, no `null` in place of a number.
 *
 * ------------------------------------------------------------------
 * THE THREE NUMBERS TO PROVE
 * ------------------------------------------------------------------
 * Judges will ask for these. They belong in `DashboardReport.security`:
 *   - legitimate signature accepted with probability 1 (deterministic)
 *   - forgery probability at or below the declared bound
 *   - zero false positives across the honest baseline runs
 */

import type {
  Agreement,
  AttackId,
  AttackResponse,
  BlockResult,
  ChannelHealthResponse,
  DashboardReport,
  DistributeResponse,
  InitResponse,
  KeygenResponse,
  LogEntry,
  SignResponse,
  VerifierResult,
  VerifierTarget,
  VerifyEvent,
} from "./types";

/** Per-call cancellation + demo speed, threaded from the store. */
export interface RunContext {
  /** fired when the user hits Skip or restarts — abandon the work */
  signal?: AbortSignal;
  /** 1 = normal speed, ~0.1 = fast-forward. Server may ignore it. */
  speed?: () => number;
  /** demo-only: force the channel health check to fail, to show the halt path */
  forceFail?: boolean;
}

export interface PlannedBlock {
  verifier: string;
  block: BlockResult;
}

export interface VerificationPlan {
  plan: PlannedBlock[];
  results: VerifierResult[];
}

/** Machine-readable failure reasons. The UI switches on `code`. */
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

export interface QdsApi {
  /* ---- 1. run bootstrap ------------------------------------------- */

  /** Create or resume a run. `seed` may be omitted for a fresh random run. */
  init(seed?: number, ctx?: RunContext): Promise<InitResponse>;

  /* ---- 2. key generation (deliverable 1) -------------------------- */

  /** Shape of the key pool. The filling animation is driven by `streamKeygen`. */
  keygen(runId: string, ctx?: RunContext): Promise<KeygenResponse>;

  /** Progress ticks for the key pool. `keygen()` returns when this ends. */
  streamKeygen(
    runId: string,
    onProgress: (created: number, total: number, done: boolean) => void,
    ctx?: RunContext,
  ): Promise<void>;

  /* ---- 3. distribution -------------------------------------------- */

  distribute(
    runId: string,
    verifierCount: number,
    ctx?: RunContext,
  ): Promise<DistributeResponse>;

  /** Per-verifier receipt ticks. Resolves once every verifier is complete. */
  streamDistribution(
    runId: string,
    verifiers: string[],
    onProgress: (received: VerifierTarget[]) => void,
    ctx?: RunContext,
  ): Promise<void>;

  /* ---- 4. channel health ------------------------------------------ */

  /**
   * Score in [0, 1]. `bands` must come from the backend — the gauge reads
   * them, it does not hard-code 0.5 / 0.8.
   */
  channelHealth(runId: string, ctx?: RunContext): Promise<ChannelHealthResponse>;

  /* ---- 5. signing (deliverable 3) --------------------------------- */

  sign(
    runId: string,
    message: string,
    verifierNames: string[],
    ctx?: RunContext,
  ): Promise<SignResponse>;

  /* ---- 6. attack launch (deliverable 4) --------------------------- */

  launchAttack(
    runId: string,
    attackId: AttackId,
    intensity: number,
    ctx?: RunContext,
  ): Promise<AttackResponse>;

  /* ---- 7. verification planning ----------------------------------- */

  /**
   * Deterministic given the seed. The whole run is planned up front so that
   * Skip can jump to the end — do not make the plan depend on wall-clock time.
   */
  planVerification(
    runId: string,
    verifierNames: string[],
    attackId: AttackId,
    intensity: number,
    seed: number,
    ctx?: RunContext,
  ): Promise<VerificationPlan>;

  /* ---- 8. verification stream ------------------------------------- */

  /**
   * Emits one `VerifyEvent` per block, in order, then resolves.
   * Must abort promptly on `ctx.signal`.
   */
  streamVerification(
    runId: string,
    plan: PlannedBlock[],
    results: VerifierResult[],
    onEvent: (event: VerifyEvent) => void,
    ctx?: RunContext,
  ): Promise<void>;

  /* ---- 9. cross-verifier agreement ------------------------------- */

  agreementFor(runId: string, results: VerifierResult[]): Promise<Agreement>;

  /* ---- 10. report -------------------------------------------------- */

  buildReport(
    runId: string,
    verifierNames: string[],
    results: VerifierResult[],
    attack: AttackResponse,
    channelScore: number,
    seed: number,
    ctx?: RunContext,
  ): Promise<DashboardReport>;

  buildLogs(
    runId: string,
    attack: AttackResponse,
    results: VerifierResult[],
    channelScore: number,
    startedAt: number,
  ): Promise<LogEntry[]>;

  /* ---- 11. evidence export ---------------------------------------- */

  fetchEvidence(runId: string, report: DashboardReport): Promise<Blob>;
}

/* ------------------------------------------------------------------ *
 * HTTP ROUTE MAP
 * ------------------------------------------------------------------ *
 * `client.ts` calls exactly these. Change a route and nothing else moves.
 *
 *   POST   /runs                     -> InitResponse
 *   GET    /runs/:runId/keygen       -> KeygenResponse
 *   GET    /runs/:runId/keygen/stream    (SSE)  keygen progress
 *   POST   /runs/:runId/verifiers    -> DistributeResponse
 *   GET    /runs/:runId/verifiers/stream (SSE)  distribution progress
 *   GET    /runs/:runId/channel-health  -> ChannelHealthResponse
 *   POST   /runs/:runId/sign         -> SignResponse
 *   POST   /runs/:runId/attack       -> AttackResponse
 *   POST   /runs/:runId/verify/plan  -> VerificationPlan
 *   GET    /runs/:runId/verify/stream    (SSE)  VerifyEvent
 *   GET    /runs/:runId/agreement    -> Agreement
 *   GET    /runs/:runId/report       -> DashboardReport
 *   GET    /runs/:runId/logs         -> LogEntry[]
 *   GET    /runs/:runId/evidence     -> application/json
 *
 * `X-QS-Seed` header on /runs lets a shared link reproduce a run.
 * ------------------------------------------------------------------ */

export const ROUTES = {
  create: "/runs",
  keygen: (id: string) => `/runs/${id}/keygen`,
  keygenStream: (id: string) => `/runs/${id}/keygen/stream`,
  verifiers: (id: string) => `/runs/${id}/verifiers`,
  verifiersStream: (id: string) => `/runs/${id}/verifiers/stream`,
  channelHealth: (id: string) => `/runs/${id}/channel-health`,
  sign: (id: string) => `/runs/${id}/sign`,
  attack: (id: string) => `/runs/${id}/attack`,
  verifyPlan: (id: string) => `/runs/${id}/verify/plan`,
  verifyStream: (id: string) => `/runs/${id}/verify/stream`,
  agreement: (id: string) => `/runs/${id}/agreement`,
  report: (id: string) => `/runs/${id}/report`,
  logs: (id: string) => `/runs/${id}/logs`,
  evidence: (id: string) => `/runs/${id}/evidence`,
} as const;

/* ------------------------------------------------------------------ *
 * EXTENSION — the Protocol page
 * ------------------------------------------------------------------ *
 * The PS names four primitives the frontend has to *show*:
 *   Bell-state entanglement · quantum teleportation
 *   Pauli correction operations · projective measurement rules
 *
 * Those are new read-only endpoints. They are additive: the five existing
 * pages work without them, and the Protocol page degrades to "not reported
 * by this backend" if they are absent.
 *
 *   GET /runs/:runId/protocol/bell       -> BellStateResponse
 *   GET /runs/:runId/protocol/teleport   -> TeleportTrace
 *   GET /runs/:runId/protocol/measure    -> MeasurementSeries[]
 *   GET /runs/:runId/protocol/forgery    -> ForgeryCurve
 *
 * Shapes live in `src/api/types.ts`. Plain numbers only — the frontend does
 * no linear algebra, it just draws them.
 */
