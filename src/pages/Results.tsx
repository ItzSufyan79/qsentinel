/**
 * Results (`/simulate/run/:run_id/result`) — design report, section 4.4.
 *
 * The direct answer to "what is the proof you're detecting this."
 * Top: large StatusBadge + verdict headline. Below: stat row, then detail.
 */

import { Link } from "react-router-dom";
import { api } from "../api";
import type { ResultResponse } from "../api/types";
import { useApi } from "../lib/useApi";
import {
  Banner,
  DataCard,
  Panel,
  SectionHead,
  StatusBadge,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { useRunId } from "../App";

export function ResultsPage() {
  const runId = useRunId();
  const { data, error, loading } = useApi<ResultResponse>(
    () => api.getResult(runId),
    [runId],
  );

  const rejected = data?.verdict === "rejected";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="micro text-primary">Run result</p>
      <h1 className="mt-2 font-condensed text-[28px] leading-tight font-semibold text-on-bg">
        Results
      </h1>

      <div className="mt-6">
        {loading && <div className="skeleton h-40 w-full" />}
        {error && <ErrorBanner error={error} />}
        {data && (
          <div className="animate-fade-up space-y-6">
            {/* verdict */}
            <div
              className={`stamp ${
                rejected ? "text-fail" : "text-pass"
              }`}
            >
              <StatusBadge tone={rejected ? "attack" : "honest"}>
                {data.verdict}
              </StatusBadge>
              <span className="stamp-label">
                {rejected ? "Rejected — attack detected" : "Accepted"}
              </span>
            </div>

            {/* stat row */}
            <div className="grid gap-3 sm:grid-cols-3">
              <DataCard
                label="Mismatch rate observed"
                value={data.mismatchRate.toFixed(3)}
                tone={rejected ? "fail" : "pass"}
              />
              <DataCard label="Threshold T" value={data.threshold.toFixed(3)} />
              <DataCard label="Confidence" value={data.confidence} />
            </div>

            {/* flagged by */}
            <Panel className="p-5">
              <SectionHead step="A" title="Flagged by" state={rejected ? "done" : "pending"}>
                <span className="micro text-n-500">flagged_by</span>
              </SectionHead>
              <p className="text-[15px] text-on-surface">
                {data.flaggedBy === "none"
                  ? "No check flagged this run — it is consistent with an honest signature."
                  : data.flaggedBy === "quantum-error-rate"
                    ? "Quantum error-rate check — the measured error rate exceeded the statistical threshold."
                    : data.flaggedBy === "classical-mac"
                      ? "Classical MAC check — the message authentication code did not verify."
                      : "Verifier cross-check mismatch — verifiers disagreed on the outcome."}
              </p>
            </Panel>

            {/* ground-truth diffs */}
            {data.flaggedDiff && data.flaggedDiff.length > 0 && (
              <Panel className="p-5">
                <SectionHead step="B" title="Ground-truth diff" state="done">
                  <span className="micro text-n-500">flagged_diff</span>
                </SectionHead>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.flaggedDiff.map((d, i) => (
                    <div key={i} className="card-muted p-4">
                      <p className="micro text-n-500">Sent</p>
                      <p className="num mt-1 text-[13px] break-all text-on-surface">{d.sent}</p>
                      <p className="micro mt-3 text-n-500">Received</p>
                      <p className="num mt-1 text-[13px] break-all text-fail">{d.received}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* per-verifier */}
            <Panel className="p-5">
              <SectionHead step="C" title="Verifier outcomes" state="done" />
              <div className="grid gap-3 sm:grid-cols-2">
                {data.verifiers.map((v) => (
                  <div key={v.name} className="card-muted flex items-center justify-between p-4">
                    <div>
                      <p className="condensed text-[14px] font-semibold text-on-surface">{v.name}</p>
                      <p className="num mt-0.5 text-[12px] text-n-500">
                        {v.failed}/{v.total} blocks failed
                      </p>
                    </div>
                    <StatusBadge tone={v.verdict === "rejected" ? "attack" : "honest"}>
                      {v.verdict}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </Panel>

            {/* arbitration + rerun */}
            <div className="flex flex-wrap items-center gap-3">
              {rejected && (
                <Link to={`/simulate/run/${runId}/arbitration`} className="btn btn-secondary">
                  View arbitration
                </Link>
              )}
              <Link to="/simulate/new" className="btn btn-primary">
                Run another simulation
              </Link>
            </div>

            {rejected && (
              <Banner tone="warn" title="Disputed verdict?">
                <p>
                  If two verifiers disagree, the Arbitration page reconciles their
                  reports side by side.
                </p>
              </Banner>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
