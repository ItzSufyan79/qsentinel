/**
 * QSentinel backend contract — SIH PS 26141.
 *
 * Contract source: UI/UX design report, section 6. `client.ts` calls exactly
 * these routes; change one here and nothing else moves.
 *
 * Nothing in `src/components` or `src/pages` talks to the network directly —
 * they consume `api` from `src/api/index.ts`, typed as `QdsApi`.
 *
 * HARD RULE (from the problem statement): the frontend never computes a
 * threshold, a count, a percentage, a probability or a verdict. Every number
 * the UI displays arrives in one of these shapes.
 */

import type {
  ActiveResponse,
  ApiErrorCode,
  ArbitrationResponse,
  ByAttackTypeRow,
  DistributionResponse,
  ForgeryComparison,
  HistogramResponse,
  KeygenResponse,
  LogPage,
  LogQuery,
  PreviewResponse,
  ResultResponse,
  RunResponse,
  SignResponse,
  SimulationParameters,
  StatsSummary,
  VerifyEvent,
  VerifierResult,
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
  /** demo-only: force the channel health check to fail, to show the halt path */
  forceFail?: boolean;
}

export interface QdsApi {
  /* ---- run lifecycle --------------------------------------------- */

  /** GET /api/simulate/active — polled by the global nav badge. */
  getActive(ctx?: RunContext): Promise<ActiveResponse>;

  /**
   * GET /api/simulate/preview — the backend-derived threshold and valid ranges
   * for a configuration. Optional by contract: a 404 means the endpoint is not
   * implemented, and the UI then shows backend-derived data as unavailable.
   */
  preview(
    params: SimulationParameters,
    ctx?: RunContext,
  ): Promise<PreviewResponse>;

  /** POST /api/simulate/run — create a run, returns its id. */
  createRun(
    params: SimulationParameters,
    ctx?: RunContext,
  ): Promise<RunResponse>;

  /* ---- live simulation phases ------------------------------------ */

  /** GET /api/simulate/{run_id}/keygen */
  getKeygen(runId: string, ctx?: RunContext): Promise<KeygenResponse>;

  /** GET /api/simulate/{run_id}/distribution */
  getDistribution(runId: string, ctx?: RunContext): Promise<DistributionResponse>;

  /** GET /api/simulate/{run_id}/signing */
  getSigning(runId: string, ctx?: RunContext): Promise<SignResponse>;

  /**
   * GET /api/simulate/{run_id}/verification — streams one VerifyEvent per
   * block, in order, then resolves. Aborts promptly on `ctx.signal`.
   */
  streamVerification(
    runId: string,
    onEvent: (event: VerifyEvent) => void,
    ctx?: RunContext,
  ): Promise<VerifierResult[]>;

  /* ---- outcome --------------------------------------------------- */

  /** GET /api/simulate/{run_id}/result */
  getResult(runId: string, ctx?: RunContext): Promise<ResultResponse>;

  /** GET /api/simulate/{run_id}/arbitration — only meaningful when disputed. */
  getArbitration(runId: string, ctx?: RunContext): Promise<ArbitrationResponse>;

  /* ---- analytics ------------------------------------------------- */

  /** GET /api/stats/summary */
  getStatsSummary(ctx?: RunContext): Promise<StatsSummary>;

  /** GET /api/stats/by-attack-type */
  getByAttackType(ctx?: RunContext): Promise<ByAttackTypeRow[]>;

  /** GET /api/stats/histogram */
  getHistogram(ctx?: RunContext): Promise<HistogramResponse>;

  /** GET /api/stats/forgery-comparison */
  getForgeryComparison(ctx?: RunContext): Promise<ForgeryComparison>;

  /* ---- event log ------------------------------------------------- */

  /**
   * GET /api/log?page=&filter=&verdict=&date=&search=
   *
   * `filter` is an attack type id or "all". The three optional refinements are
   * sent only when set; a backend that does not implement them simply returns
   * the unfiltered page, which is why the log view labels what it filtered.
   */
  getLog(
    page: number,
    filter: string,
    extra?: LogQuery,
    ctx?: RunContext,
  ): Promise<LogPage>;

  /** GET /api/log/export — CSV of the current filtered view. */
  exportLog(filter: string, extra?: LogQuery, ctx?: RunContext): Promise<Blob>;
}

/* ------------------------------------------------------------------ *
 * HTTP ROUTE MAP — design report, section 6
 * ------------------------------------------------------------------ */

export const ROUTES = {
  active: "/api/simulate/active",
  preview: "/api/simulate/preview",
  run: "/api/simulate/run",
  keygen: (id: string) => `/api/simulate/${id}/keygen`,
  distribution: (id: string) => `/api/simulate/${id}/distribution`,
  signing: (id: string) => `/api/simulate/${id}/signing`,
  verification: (id: string) => `/api/simulate/${id}/verification`,
  result: (id: string) => `/api/simulate/${id}/result`,
  arbitration: (id: string) => `/api/simulate/${id}/arbitration`,
  statsSummary: "/api/stats/summary",
  statsByAttackType: "/api/stats/by-attack-type",
  statsHistogram: "/api/stats/histogram",
  statsForgeryComparison: "/api/stats/forgery-comparison",
  log: "/api/log",
  logExport: "/api/log/export",
} as const;
