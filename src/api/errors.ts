import { ApiError, type ApiErrorCode } from "./contract";

/**
 * Every failure the user can see is one of these stages. The stage drives two
 * things: the label on the panel, and which action `retry()` re-runs.
 */
export type FailureStage =
  | "boot"
  | "keygen"
  | "distribute"
  | "health"
  | "sign"
  | "attack"
  | "verify"
  | "evidence";

export const FAILURE_STAGE_LABEL: Record<FailureStage, string> = {
  boot: "starting the run",
  keygen: "generating keys",
  distribute: "distributing keys",
  health: "checking channel health",
  sign: "signing the message",
  attack: "running the attack simulation",
  verify: "verifying the signature",
  evidence: "exporting evidence",
};

export interface RunError {
  code: ApiErrorCode;
  stage: FailureStage;
  message: string;
  detail?: string;
  status: number;
  /** A retry might plausibly succeed. Config errors and a missing run will not. */
  retryable: boolean;
}

/**
 * Cancellation is not a failure, and it arrives in two shapes: a DOMException
 * from the mock's `sleep`, and an `ApiError("ABORTED")` from the HTTP client
 * when the user hits Skip. Both must stay silent.
 */
export function isCancellation(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof ApiError && err.code === "ABORTED";
}

const RETRYABLE: ReadonlySet<ApiErrorCode> = new Set([
  "NETWORK",
  "TIMEOUT",
  "CHANNEL_UNTRUSTED",
  "BACKEND_ERROR",
]);

/** Normalises anything thrown — including non-ApiError junk — into `RunError`. */
export function describeError(err: unknown, stage: FailureStage): RunError {
  const known = err instanceof ApiError ? err : undefined;
  const message = known
    ? known.message
    : err instanceof Error && err.message
      ? err.message
      : String(err);

  return {
    code: known?.code ?? "BACKEND_ERROR",
    stage,
    message,
    detail: known?.detail,
    status: known?.status ?? 0,
    retryable: RETRYABLE.has(known?.code ?? "BACKEND_ERROR"),
  };
}
