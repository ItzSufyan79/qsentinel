/**
 * HTTP + SSE implementation of `QdsApi`.
 *
 * This is the only file in the app that knows the network exists. It talks to
 * the routes in `ROUTES` (see `contract.ts`) and nothing else.
 *
 * Enable with VITE_API_MODE=http (see .env.example).
 */

import { ApiError, ROUTES, type QdsApi, type RunContext, type VerificationPlan } from "./contract";
import type {
  Agreement,
  AttackResponse,
  BellStateResponse,
  ChannelHealthResponse,
  DashboardReport,
  DistributeResponse,
  InitResponse,
  KeygenResponse,
  LogEntry,
  MeasurementSeries,
  SignResponse,
  TeleportTrace,
  VerifierTarget,
  VerifyEvent,
} from "./types";

import { ENV } from "./env";

const BASE = ENV.VITE_API_URL ?? "http://127.0.0.1:8000";
const TIMEOUT_MS = Number(ENV.VITE_API_TIMEOUT ?? 15_000);

function join(path: string): string {
  return `${BASE.replace(/\/$/, "")}${path}`;
}

function withTimeout(ctx?: RunContext): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new ApiError("TIMEOUT", `Request timed out after ${TIMEOUT_MS}ms`));
  }, TIMEOUT_MS);

  const onAbort = () => controller.abort(ctx?.signal?.reason);
  ctx?.signal?.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      ctx?.signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  ctx?: RunContext,
): Promise<T> {
  const { signal, done } = withTimeout(ctx);

  let response: Response;
  try {
    response = await fetch(join(path), {
      ...init,
      signal,
      headers: { "content-type": "application/json", accept: "application/json", ...init.headers },
    });
  } catch (err) {
    done();
    if (ctx?.signal?.aborted) throw new ApiError("ABORTED", "Request cancelled");
    if (signal.aborted) throw new ApiError("TIMEOUT", `Request timed out after ${TIMEOUT_MS}ms`);
    throw new ApiError("NETWORK", `Cannot reach the backend at ${BASE}`, 0, String(err));
  }
  done();

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const code = (() => {
      switch (response.status) {
        case 404:
          return "RUN_NOT_FOUND" as const;
        case 409:
        case 422:
          return "INVALID_STATE" as const;
        case 503:
          return "CHANNEL_UNTRUSTED" as const;
        default:
          return "BACKEND_ERROR" as const;
      }
    })();
    throw new ApiError(code, detail || `${response.status} ${response.statusText}`, response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown, ctx?: RunContext): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) }, ctx);
}

/**
 * Server-sent events. Reads `data:` lines, parses each payload as JSON and
 * hands it to `onMessage`. Resolves when the stream closes or `done` is sent.
 */
async function sse<T>(
  path: string,
  onMessage: (data: T) => void,
  isDone: (data: T) => boolean,
  ctx?: RunContext,
): Promise<void> {
  if (ctx?.signal?.aborted) throw new ApiError("ABORTED", "Stream cancelled");

  const { signal, done } = withTimeout(ctx);

  let response: Response;
  try {
    response = await fetch(join(path), {
      signal,
      headers: { accept: "text/event-stream" },
    });
  } catch (err) {
    done();
    if (ctx?.signal?.aborted) throw new ApiError("ABORTED", "Stream cancelled");
    throw new ApiError("NETWORK", `Cannot open the event stream at ${path}`, 0, String(err));
  }

  if (!response.ok || !response.body) {
    done();
    throw new ApiError("BACKEND_ERROR", `Stream ${path} failed: ${response.status}`, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  try {
    while (!finished) {
      const { value, done: eof } = await reader.read();
      if (eof) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) continue;

        const payload = dataLine.slice(5).trim();
        if (!payload) continue;

        let parsed: T;
        try {
          parsed = JSON.parse(payload) as T;
        } catch {
          continue; // keep-alive comment or malformed frame — skip it
        }

        onMessage(parsed);
        if (isDone(parsed)) {
          finished = true;
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
  } catch (err) {
    if (ctx?.signal?.aborted) throw new ApiError("ABORTED", "Stream cancelled");
    throw new ApiError("NETWORK", "Event stream dropped mid-run", 0, String(err));
  } finally {
    done();
  }
}

export const httpApi: QdsApi = {
  init(seed, ctx) {
    return post<InitResponse>(
      ROUTES.create,
      seed === undefined ? {} : { seed },
      ctx,
    );
  },

  keygen(runId, ctx) {
    return request<KeygenResponse>(ROUTES.keygen(runId), {}, ctx);
  },

  streamKeygen(runId, onProgress, ctx) {
    return sse<{ created: number; total: number; done: boolean }>(
      ROUTES.keygenStream(runId),
      (event) => onProgress(event.created, event.total, event.done),
      (event) => event.done,
      ctx,
    );
  },

  distribute(runId, verifierCount, ctx) {
    return post<DistributeResponse>(ROUTES.verifiers(runId), { verifierCount }, ctx);
  },

  streamDistribution(runId, verifiers, onProgress, ctx) {
    return sse<{ verifiers: VerifierTarget[]; done: boolean }>(
      `${ROUTES.verifiersStream(runId)}?verifiers=${verifiers.join(",")}`,
      (event) => onProgress(event.verifiers),
      (event) => event.done,
      ctx,
    );
  },

  channelHealth(runId, ctx) {
    return request<ChannelHealthResponse>(
      ROUTES.channelHealth(runId),
      ctx?.forceFail ? { headers: { "x-qs-force-fail": "1" } } : {},
      ctx,
    );
  },

  sign(runId, message, verifierNames, ctx) {
    return post<SignResponse>(ROUTES.sign(runId), { message, verifierNames }, ctx);
  },

  launchAttack(runId, attackId, intensity, ctx) {
    return post<AttackResponse>(ROUTES.attack(runId), { attackId, intensity }, ctx);
  },

  planVerification(runId, verifierNames, attackId, intensity, seed, ctx) {
    return post<VerificationPlan>(
      ROUTES.verifyPlan(runId),
      { verifierNames, attackId, intensity, seed },
      ctx,
    );
  },

  streamVerification(runId, _plan, _results, onEvent, ctx) {
    return sse<VerifyEvent>(
      ROUTES.verifyStream(runId),
      // The terminal frame may be a bare {"done":true} control frame. Anything
      // without a `verifier` is a control frame, not a block result.
      (event) => {
        if (typeof (event as VerifyEvent).verifier === "string") onEvent(event);
      },
      (event) => (event as VerifyEvent & { done?: boolean }).done === true,
      ctx,
    );
  },

  agreementFor(runId, results) {
    return request<Agreement>(ROUTES.agreement(runId), {
      method: "POST",
      body: JSON.stringify({ results }),
    });
  },

  fetchBellState(runId, ctx) {
    return request<BellStateResponse>(ROUTES.protocolBell(runId), ctx);
  },

  fetchTeleportTrace(runId, ctx) {
    return request<TeleportTrace>(ROUTES.protocolTeleport(runId), ctx);
  },

  fetchMeasurements(runId, ctx) {
    return request<MeasurementSeries[]>(ROUTES.protocolMeasure(runId), ctx);
  },

  buildReport(runId, verifierNames, results, attack, channelScore, seed, ctx) {
    return post<DashboardReport>(
      ROUTES.report(runId),
      { verifierNames, results, attack, channelScore, seed },
      ctx,
    );
  },

  buildLogs(runId, attack, results, channelScore, startedAt) {
    return request<LogEntry[]>(ROUTES.logs(runId), {
      method: "POST",
      body: JSON.stringify({ attack, results, channelScore, startedAt }),
    });
  },

  async fetchEvidence(runId, report) {
    const { signal, done } = withTimeout();
    try {
      const response = await fetch(join(ROUTES.evidence(runId)), {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!response.ok) {
        throw new ApiError("BACKEND_ERROR", `Evidence export failed: ${response.status}`, response.status);
      }
      return await response.blob();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError("NETWORK", "Evidence export unreachable", 0, String(err));
    } finally {
      done();
    }
  },
};
