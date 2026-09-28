/**
 * HTTP implementation of the QSentinel contract.
 *
 * Every method maps to exactly one route in `ROUTES`. The frontend never sees
 * `fetch`, a URL or a JSON shape — it sees typed methods.
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
  RunEvent,
} from "./types";
import { ApiError } from "./types";
import { ROUTES, type QdsApi, type RunContext } from "./contract";
import { env } from "./env";

/** Read per request so the failure-path test can point at different hosts. */
const BASE = () => env("VITE_API_URL") ?? "http://127.0.0.1:8000";
const TIMEOUT = () => Number(env("VITE_API_TIMEOUT") ?? 15000);

/** Serialises the log filters, omitting refinements that are not set. */
function logQuery(filters: LogFilters): string {
  const q = new URLSearchParams();
  if (filters.stage && filters.stage !== "all") q.set("stage", filters.stage);
  if (filters.actor && filters.actor !== "all") q.set("actor", filters.actor);
  if (filters.level && filters.level !== "all") q.set("level", filters.level);
  if (filters.q) q.set("q", filters.q);
  return q.toString();
}

/** Maps an HTTP status onto the error codes the UI knows how to explain. */
function statusToCode(status: number): ApiErrorCode {
  if (status === 404) return "RUN_NOT_FOUND";
  if (status === 400 || status === 422) return "INVALID_PARAMS";
  if (status === 412) return "INVALID_STATE";
  return "BACKEND_ERROR";
}

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
        statusToCode(res.status),
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
  createRun: (config, ctx) =>
    post<CreateRunResponse>(ROUTES.run, {
      attack: config.attack,
      ...(config.subtype ? { subtype: config.subtype } : {}),
      message: config.message,
      ...(config.tamperedMessage ? { tampered_message: config.tamperedMessage } : {}),
      ...(config.targetLink ? { target_link: config.targetLink } : {}),
      ...(config.fixedBasis ? { fixed_basis: config.fixedBasis } : {}),
      ...(config.intensityPct !== null ? { intensity_pct: config.intensityPct } : {}),
      ...(config.replayType ? { replay_type: config.replayType } : {}),
    }, ctx),

  async streamEvents(runId, onEvent, ctx = {}): Promise<void> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    ctx.signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), TIMEOUT());

    try {
      const res = await fetch(`${BASE()}${ROUTES.events(runId)}`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) {
        throw new ApiError("BACKEND_ERROR", `Stream failed with ${res.status}`, res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            onEvent(JSON.parse(payload) as RunEvent);
          } catch {
            // a malformed frame is skipped, the stream itself survives
          }
        }
      }
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

  getLogs: (runId, filters = {}, ctx) =>
    get<LogRow[]>(
      `${ROUTES.logs(runId)}${filters.stage || filters.actor || filters.level || filters.q ? `?${logQuery(filters)}` : ""}`,
      ctx,
    ),

  getBinomial: (n, pHonest, pCheat, ctx) =>
    get<BinomialResponse>(
      `${ROUTES.binomial}?${new URLSearchParams({
        n: String(n),
        p_honest: String(pHonest),
        p_cheat: String(pCheat),
      })}`,
      ctx,
    ),

  rerun: (runId, ctx) => post<RerunResponse>(ROUTES.rerun(runId), {}, ctx),

  getHistory: (ctx) => get<HistoryResponse>(ROUTES.history, ctx),
};