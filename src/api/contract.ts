/**
 * QSentinel backend contract — SIH PS 26141.
 *
 * Contract source: UI/UX design report, section 11 (data contract). `client.ts`
 * calls exactly these routes; change one here and nothing else moves.
 *
 * Nothing in `src/components` or `src/pages` talks to the network directly —
 * they consume `api` from `src/api/index.ts`, typed as `QdsApi`.
 *
 * HARD RULE (from the problem statement): the frontend never calculates a
 * threshold, a count, a percentage, a probability or a verdict. Every number
 * the UI displays arrives in one of these shapes. Missing fields render as the
 * report's "Not run" card.
 */

import type {
  ApiErrorCode,
  BinomialResponse,
  CreateRunResponse,
  HistoryResponse,
  LogFilters,
  LogRow,
  RerunResponse,
  ResultResponse,
  RunConfig,
  RunEvent,
  SystemResponse,
} from "./types";
import { ApiError } from "./types";

export { ApiError };
export type { ApiErrorCode };

/** Per-call cancellation + demo speed, threaded from the store. */
export interface RunContext {
  /** fired when the user hits Skip or restarts — abandon the work */
  signal?: AbortSignal;
  /** 1 = normal speed, ~0.1 = fast-forward. Server may ignore it. */
  speed?: () => number;
}

export interface QdsApi {
  /**
   * POST /api/runs — create a session from the user's attack config.
   * body: { attack, subtype, message, tampered_message, target_link,
   *        fixed_basis, intensity_pct, replay_type } -> { session_id }.
   */
  createRun(config: RunConfig, ctx?: RunContext): Promise<CreateRunResponse>;

  /**
   * GET /api/runs/{id}/events — server-sent event stream for the whole
   * lifecycle (report 6 + 11). Resolves when the run finishes (DONE frame).
   */
  streamEvents(
    runId: string,
    onEvent: (event: RunEvent) => void,
    ctx?: RunContext,
  ): Promise<void>;

  /** GET /api/runs/{id}/result — the full Results dashboard payload. */
  getResult(runId: string, ctx?: RunContext): Promise<ResultResponse>;

  /**
   * GET /api/runs/{id}/logs?stage=&actor=&level=&q= — the System Logs tab.
   * Unset filters are omitted; a backend that does not implement a filter
   * returns the unfiltered list.
   */
  getLogs(runId: string, filters?: LogFilters, ctx?: RunContext): Promise<LogRow[]>;

  /**
   * GET /api/analysis/binomial?n=&p_honest=&p_cheat= — exact binomial curves
   * for the bag-distribution chart and its what-if explorer. The pass line
   * and both error probabilities are computed by the backend, never the UI.
   */
  getBinomial(
    n: number,
    pHonest: number,
    pCheat: number,
    ctx?: RunContext,
  ): Promise<BinomialResponse>;

  /** POST /api/runs/{id}/rerun — same settings, new session. */
  rerun(runId: string, ctx?: RunContext): Promise<RerunResponse>;

  /**
   * GET /api/system — fixed parameters, fingerprint library, versions.
   * The backend owns every displayed constant (report 2.2, 7.2).
   */
  getSystem(ctx?: RunContext): Promise<SystemResponse>;

  /** GET /api/history — past runs + per-attack detection summary. */
  getHistory(ctx?: RunContext): Promise<HistoryResponse>;
}

/* ------------------------------------------------------------------ *
 *  HTTP ROUTE MAP — design report, section 11
 * ------------------------------------------------------------------ */

export const ROUTES = {
  run: "/api/runs",
  events: (id: string) => `/api/runs/${id}/events`,
  result: (id: string) => `/api/runs/${id}/result`,
  logs: (id: string) => `/api/runs/${id}/logs`,
  rerun: (id: string) => `/api/runs/${id}/rerun`,
  binomial: "/api/analysis/binomial",
  history: "/api/history",
  system: "/api/system",
} as const;

/* ------------------------------------------------------------------ *
 *  Fixed, backend-controlled parameters — report 2.2 §5.5, shown read-only
 * ------------------------------------------------------------------ */

export const SYSTEM_PARAMS = {
  slotsPerBag: 128,
  bags: 63,
  passLine: 12,
  fidelityGate: 0.5,
  verifierNames: ["Bob", "Charlie"] as const,
  honestErrorRate: 0.02,
} as const;