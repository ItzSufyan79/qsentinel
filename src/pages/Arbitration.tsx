/**
 * Arbitration (`/simulate/run/:run_id/arbitration`) — design report, section 4.7.
 *
 * The verifier-vs-verifier case. Only reachable from a disputed Results page.
 * One VerifierPanel per configured verifier, then the cross-check and the
 * arbiter's ruling. The panel count follows the run's verifier count, so a
 * three-verifier run shows three panels.
 */

import { Link } from "react-router-dom";
import { api } from "../api";
import type { ArbitrationResponse } from "../api/types";
import { useApi } from "../lib/useApi";
import {
  Banner,
  Panel,
  SectionHead,
  StatusBadge,
  VerifierPanel,
} from "../components/ui/atoms";
import { Icon } from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { useRunId } from "../lib/useRunId";

export function ArbitrationPage() {
  const runId = useRunId();
  const { data, error, loading } = useApi<ArbitrationResponse>(
    () => api.getArbitration(runId),
    [runId],
  );
  const count = data?.verifiers.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--qs-r-sm)] bg-primary text-on-primary">
          <Icon name="scale" size={18} />
        </span>
        <div>
          <p className="micro text-accent-ink">Dispute resolution</p>
          <h1 className="font-display text-[28px] leading-tight font-semibold text-on-bg">
            Arbitration
          </h1>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-n-600">
        {count > 0 ? (
          <>
            {count} verifier{count === 1 ? "" : "s"} reported conflicting
            outcomes. Each panel shows their independent verdict; the
            reconciliation below rules on which report was inconsistent, without
            exposing raw key material.
          </>
        ) : (
          "Each panel below shows an independent verdict; the reconciliation rules on which report was inconsistent, without exposing raw key material."
        )}
      </p>

      <div className="mt-6">
        {loading && <div className="skeleton h-48 w-full" />}
        {error && <ErrorBanner error={error} />}
        {data && (
          <div className="animate-fade-up space-y-6">
            <div
              className={`grid gap-4 ${
                count > 2 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
              }`}
            >
              {data.verifiers.map((v, i) => (
                <VerifierPanel
                  key={v.name}
                  name={v.name}
                  index={i + 1}
                  mismatchRate={v.mismatchRate}
                  verdict={v.verdict}
                  timestamp={v.timestamp}
                  active={i === 0}
                />
              ))}
            </div>

            <Panel className="p-5">
              <SectionHead
                step="A"
                title="Cross-check result"
                state={data.crossCheckStatus === "diverged" ? "done" : "pending"}
              >
                <span className="micro text-n-500">cross_check_status</span>
              </SectionHead>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge
                  tone={data.crossCheckStatus === "diverged" ? "disputed" : "honest"}
                >
                  {data.crossCheckStatus}
                </StatusBadge>
                <p className="text-[14px] text-n-600">
                  {data.crossCheckStatus === "diverged"
                    ? `The cross-check between the ${count} verifiers diverged — their reports do not sit in the same band.`
                    : `The cross-check between the ${count} verifiers matched.`}
                </p>
              </div>
            </Panel>

            <Panel className="p-5">
              <SectionHead step="B" title="Arbiter resolution" state="done">
                <span className="micro text-n-500">arbiter_ruling</span>
              </SectionHead>
              <p className="text-[15px] leading-relaxed text-on-surface">
                {data.arbiterRuling}
              </p>
            </Panel>

            <div className="flex flex-wrap gap-3">
              <Link to={`/simulate/run/${runId}/result`} className="btn btn-secondary">
                Back to results
              </Link>
              <Link to="/simulate/new" className="btn btn-primary">
                Run another simulation
              </Link>
            </div>

            <Banner tone="neutral" title="Why this page is hidden">
              <p>
                Arbitration is not in the top nav. It only appears when a verdict
                is disputed, so the nav stays uncluttered for the runs that never
                need it.
              </p>
            </Banner>
          </div>
        )}
      </div>
    </div>
  );
}
