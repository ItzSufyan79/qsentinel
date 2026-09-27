import { FAILURE_STAGE_LABEL, type RunError } from "../../api/errors";
import { useFlow } from "../../state/flowStore";
import { Icon } from "../ui/Icon";

/** Copy per code: what happened, and what the user can do about it. */
const COPY: Record<
  RunError["code"],
  { title: string; advice: string; retryable: boolean }
> = {
  NETWORK: {
    title: "Backend unreachable",
    advice:
      "Nothing was lost — the run is still on the server. Check the backend is running and that VITE_API_URL points at it, then retry.",
    retryable: true,
  },
  TIMEOUT: {
    title: "Backend timed out",
    advice:
      "The request exceeded the configured timeout. A heavy first run can do this; raise VITE_API_TIMEOUT or retry.",
    retryable: true,
  },
  ABORTED: {
    title: "Request cancelled",
    advice: "The request was cancelled before it finished.",
    retryable: true,
  },
  CHANNEL_UNTRUSTED: {
    title: "Channel failed its health check",
    advice:
      "QSentinel will not distribute keys over an untrusted channel. That refusal is the security control working. Fix the channel, or re-run the check to try again.",
    retryable: true,
  },
  RUN_NOT_FOUND: {
    title: "Run no longer exists",
    advice:
      "The backend has no record of this run — it was likely restarted. Start a new run; the seed in the URL keeps it reproducible.",
    retryable: false,
  },
  INVALID_STATE: {
    title: "Run is not ready for that",
    advice:
      "The backend rejected the call because the run is not in a state that allows it. Restart the run to resynchronise.",
    retryable: false,
  },
  BACKEND_ERROR: {
    title: "Backend error",
    advice:
      "The backend reported a failure. The detail below is the raw response, which is usually the fastest route to a fix.",
    retryable: true,
  },
};

const STAGE_HINT: Record<RunError["stage"], string> = {
  boot: "The run could not be created, so there is nothing to recover.",
  keygen: "Key generation did not start.",
  distribute: "Keys were generated but not fully delivered to the verifiers.",
  health: "Distribution finished, but the channel check did not complete.",
  sign: "The message was not signed.",
  attack: "The attack simulation did not run.",
  verify: "The signature was not verified, so there is no verdict to show.",
  evidence: "The run is intact — only the export failed.",
};

/**
 * The single place a failed run is explained. Replaces the previous behaviour of
 * re-throwing into nothing, which left the UI spinning with no message.
 */
export function ErrorPanel() {
  const error = useFlow((s) => s.error);
  const retry = useFlow((s) => s.retry);
  const dismiss = useFlow((s) => s.clearError);
  const running = useFlow((s) => s.running);

  if (!error) return null;
  const copy = COPY[error.code];

  return (
    <div
      className="animate-pop border border-fail/40 bg-surface p-4"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: "var(--qs-fail)",
        background: "color-mix(in oklab, var(--qs-fail) 4%, var(--qs-surface))",
      }}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span style={{ color: "var(--qs-fail)" }} className="mt-0.5 shrink-0">
          <Icon name="alert" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p
              className="num text-[11px] font-semibold tracking-[0.1em] uppercase"
              style={{ color: "var(--qs-fail)" }}
            >
              {error.code.replace(/_/g, " ")}
            </p>
            <span className="micro">{error.stage}</span>
            {error.status > 0 && <span className="micro">HTTP {error.status}</span>}
          </div>

          <h2 className="mt-1.5 text-[15px] leading-tight font-semibold tracking-tight text-on-bg">
            {copy.title}
          </h2>

          <p className="mt-1.5 text-[13px] leading-snug text-n-600 dark:text-n-700">
            {STAGE_HINT[error.stage]} {copy.advice}
          </p>

          <p className="micro mt-2">
            Stage: {FAILURE_STAGE_LABEL[error.stage]}
          </p>

          {(error.message || error.detail) && (
            <details className="mt-2.5 border-t border-outline pt-2.5">
              <summary className="micro cursor-pointer list-none select-none hover:text-on-bg">
                Technical detail
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-n-600 dark:text-n-700">
                {error.message}
                {error.detail && `\n${error.detail}`}
              </pre>
            </details>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          {copy.retryable && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void retry()}
              disabled={running}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="rotate" size={13} />
                {running ? "Retrying" : "Retry"}
              </span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={dismiss}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
