import { ApiError, type ApiErrorCode } from "../../api";

const COPY: Record<ApiErrorCode, { title: string; advice: string }> = {
  NETWORK: {
    title: "Backend unreachable",
    advice:
      "Check the backend is running and that VITE_API_URL points at it. In mock mode this cannot happen — the demo always boots.",
  },
  TIMEOUT: {
    title: "Request timed out",
    advice:
      "The request exceeded the configured timeout. Raise VITE_API_TIMEOUT or try again.",
  },
  ABORTED: {
    title: "Cancelled",
    advice: "The operation was cancelled.",
  },
  RUN_NOT_FOUND: {
    title: "Run not found",
    advice:
      "This run id is unknown to the backend. It may have expired, or the link is wrong.",
  },
  INVALID_STATE: {
    title: "Invalid state",
    advice:
      "The backend rejected the call because the run is not in the right state for it.",
  },
  CHANNEL_UNTRUSTED: {
    title: "Channel untrusted",
    advice:
      "The channel health check failed, so the run refuses to proceed. Refusal is part of the demonstration.",
  },
  BACKEND_ERROR: {
    title: "Backend error",
    advice: "Something failed on the server. Try again; if it persists, check the logs.",
  },
};

/**
 * Presentational error banner. Pages feed it the `error` from `useApi`, so
 * error copy lives in one place and every page renders it identically.
 */
export function ErrorBanner({ error }: { error: ApiError | null }) {
  if (!error) return null;
  const copy = COPY[error.code] ?? COPY.BACKEND_ERROR;
  return (
    <div
      role="alert"
      className="mb-4 rounded-[var(--qs-r)] border border-fail bg-fail-tint p-4"
    >
      <p className="display text-[13px] font-semibold tracking-[0.04em] text-fail uppercase">
        {copy.title}
      </p>
      <p className="mt-1 text-[14px] leading-relaxed text-on-surface">{copy.advice}</p>
      {error.detail && (
        <p className="num mt-2 text-[12px] break-all text-n-500">{error.detail}</p>
      )}
    </div>
  );
}
