/**
 * HTTP implementation of the QSentinel contract.
 *
 * Every method maps to exactly one route in `ROUTES`. The frontend never sees
 * `fetch`, a URL or a JSON shape — it sees typed methods.
 */

import type {
  ActiveResponse,
  ArbitrationResponse,
  AttackTypeId,
  ByAttackTypeRow,
  DistributionResponse,
  ForgeryComparison,
  HistogramResponse,
  KeygenResponse,
  LogPage,
  PreviewResponse,
  ResultResponse,
  RunResponse,
  SignResponse,
  StatsSummary,
  VerifierResult,
  VerifyEvent,
} from "./types";
import { ApiError } from "./types";
import { ROUTES, type QdsApi, type RunContext } from "./contract";
import { env } from "./env";

/** Read per request so the failure-path test can point at different hosts. */
const BASE = () => env("VITE_API_URL") ?? "http://127.0.0.1:8000";
const TIMEOUT = () => Number(env("VITE_API_TIMEOUT") ?? 15000);

async function request<T>(
  path: string,
  init: RequestInit = {},
  ctx: RunContext = {},
  timeout = TIMEOUT(),
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  ctx.signal?.addEventListener("abort", onAbort);

  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(
        res.status === 404 ? "RUN_NOT_FOUND" : res.status === 409 ? "CHANNEL_UNTRUSTED" : "BACKEND_ERROR",
        body || `Request failed with ${res.status}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (controller.signal.aborted) {
      throw ctx.signal?.aborted
        ? new ApiError("ABORTED", "Cancelled")
        : new ApiError("TIMEOUT", "Request timed out", 0, `>${timeout}ms`);
    }
    throw new ApiError("NETWORK", err instanceof Error ? err.message : "Network error");
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener("abort", onAbort);
  }
}

const get = <T>(path: string, ctx?: RunContext) => request<T>(path, {}, ctx);
const post = <T>(path: string, body: unknown, ctx?: RunContext) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) }, ctx);

export const httpApi: QdsApi = {
  getActive: (ctx) => get<ActiveResponse>(ROUTES.active, ctx),

  preview: (attack, n, threshold, ctx) =>
    get<PreviewResponse>(
      `${ROUTES.preview}?attack=${attack}&n=${n}&threshold=${threshold}`,
      ctx,
    ),

  createRun: (attack, n, threshold, verifierCount, ctx) =>
    post<RunResponse>(
      ROUTES.run,
      { attack, n, threshold, verifierCount },
      ctx,
    ),

  getKeygen: (runId, ctx) => get<KeygenResponse>(ROUTES.keygen(runId), ctx),

  getDistribution: (runId, ctx) =>
    get<DistributionResponse>(ROUTES.distribution(runId), ctx),

  getSigning: (runId, ctx) => get<SignResponse>(ROUTES.signing(runId), ctx),

  async streamVerification(runId, onEvent, ctx = {}): Promise<VerifierResult[]> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    ctx.signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), TIMEOUT());

    try {
      const res = await fetch(`${BASE()}${ROUTES.verification(runId)}`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) {
        throw new ApiError("BACKEND_ERROR", `Stream failed with ${res.status}`, res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const results = new Map<string, VerifierResult>();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; a bare {"done":true}
        // control frame is not a VerifyEvent and must not reach the store.
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let event: VerifyEvent & { done?: boolean };
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (event.done) continue;
          onEvent(event);
          const r = event.result;
          results.set(r.name, { ...r });
        }
      }
      return [...results.values()];
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (controller.signal.aborted) {
        throw ctx.signal?.aborted
          ? new ApiError("ABORTED", "Cancelled")
          : new ApiError("TIMEOUT", "Stream timed out");
      }
      throw new ApiError("NETWORK", err instanceof Error ? err.message : "Network error");
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onAbort);
    }
  },

  getResult: (runId, ctx) => get<ResultResponse>(ROUTES.result(runId), ctx),

  getArbitration: (runId, ctx) =>
    get<ArbitrationResponse>(ROUTES.arbitration(runId), ctx),

  getStatsSummary: (ctx) => get<StatsSummary>(ROUTES.statsSummary, ctx),

  getByAttackType: (ctx) => get<ByAttackTypeRow[]>(ROUTES.statsByAttackType, ctx),

  getHistogram: (ctx) => get<HistogramResponse>(ROUTES.statsHistogram, ctx),

  getForgeryComparison: (ctx) => get<ForgeryComparison>(ROUTES.statsForgeryComparison, ctx),

  getLog: (page, filter, ctx) =>
    get<LogPage>(`${ROUTES.log}?page=${page}&filter=${encodeURIComponent(filter)}`, ctx),

  async exportLog(filter, ctx: RunContext = {}) {
    const res = await fetch(
      `${ROUTES.logExport}?filter=${encodeURIComponent(filter)}`,
      { signal: ctx.signal },
    );
    if (!res.ok) throw new ApiError("BACKEND_ERROR", `Export failed with ${res.status}`, res.status);
    return res.blob();
  },
};

export type { AttackTypeId };
