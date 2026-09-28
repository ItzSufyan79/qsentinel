/**
 * Analytics Dashboard (`/dashboard`) — design report, section 4.5.
 *
 * The cumulative view — this is what turns a one-off demo into "a system."
 * Four stat cards, the detection-rate table, the mismatch histogram, the
 * forgery comparison, verifier agreement and the partial-attack analysis.
 *
 * The stats endpoints take no filter arguments, so the attack-type control here
 * filters the rows the backend already returned — it never recomputes a rate.
 */

import { useMemo, useState } from "react";
import { api } from "../api";
import type {
  ByAttackTypeRow,
  ForgeryComparison,
  HistogramResponse,
  StatsSummary,
} from "../api/types";
import { ATTACK_OPTIONS } from "../api/types";
import { useApi } from "../lib/useApi";
import { pct, probability } from "../lib/formatting";
import {
  ComparisonBar,
  DataCard,
  EmptyState,
  Panel,
  SectionHead,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

export function DashboardPage() {
  const [attackFilter, setAttackFilter] = useState("all");

  const summary = useApi<StatsSummary>(() => api.getStatsSummary(), []);
  const byAttack = useApi<ByAttackTypeRow[]>(() => api.getByAttackType(), []);
  const histogram = useApi<HistogramResponse>(() => api.getHistogram(), []);
  const forgery = useApi<ForgeryComparison>(() => api.getForgeryComparison(), []);

  const error = summary.error ?? byAttack.error ?? histogram.error ?? forgery.error;

  // view-level filter over backend rows only
  const visibleRows = useMemo(() => {
    if (!byAttack.data) return [];
    return attackFilter === "all"
      ? byAttack.data
      : byAttack.data.filter((r) => r.attackType === attackFilter);
  }, [byAttack.data, attackFilter]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <p className="micro text-accent-ink">Cumulative view</p>
      <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold text-on-bg">
        Analytics dashboard
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-n-600">
        Aggregate results across every run. This is the view that turns a one-off
        demo into a system.
      </p>

      {/* filter row */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="micro text-n-500">Attack type</span>
          <select
            value={attackFilter}
            onChange={(e) => setAttackFilter(e.target.value)}
            className="rounded-[var(--qs-r)] border border-outline-strong bg-surface px-3 py-2 text-[13px] text-on-surface"
          >
            <option value="all">All</option>
            {ATTACK_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[13px] text-n-500">
          The stats endpoints are cumulative over all logged runs — there is no
          server-side date range to narrow them to.
        </p>
      </div>

      {/* stat cards */}
      <div className="mt-6">
        <SectionHead step="A" title="Summary">
          <span className="micro text-n-500">GET /api/stats/summary</span>
        </SectionHead>
        {summary.loading && <div className="skeleton h-28 w-full" />}
        {summary.data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataCard label="Total runs" value={summary.data.totalRuns.toLocaleString()} />
            <DataCard
              label="Overall detection rate"
              value={summary.data.detectionRate.toFixed(3)}
              tone="pass"
            />
            <DataCard
              label="Avg mismatch — honest"
              value={summary.data.avgMismatchHonest.toFixed(3)}
            />
            <DataCard
              label="Avg mismatch — attacked"
              value={summary.data.avgMismatchAttacked.toFixed(3)}
              tone="fail"
            />
          </div>
        )}
      </div>

      {/* detection-rate table */}
      <div className="mt-8">
        <SectionHead step="B" title="Detection rate by attack type">
          <span className="micro text-n-500">GET /api/stats/by-attack-type</span>
        </SectionHead>
        <Panel>
          {byAttack.loading && <div className="skeleton h-40 w-full" />}
          {byAttack.data && visibleRows.length === 0 && (
            <EmptyState title="No runs for that attack type">
              Switch the filter back to “All” to see every scenario the engine
              has run.
            </EmptyState>
          )}
          {byAttack.data && visibleRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-outline-strong text-left">
                    {["Attack type", "Runs", "Detected", "Detection rate"].map((h) => (
                      <th
                        key={h}
                        className="display px-3 py-2.5 font-medium tracking-[0.04em] text-n-500 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.attackType} className="border-b border-outline last:border-0">
                      <td className="px-3 py-2.5 text-on-surface">{row.label}</td>
                      <td className="num px-3 py-2.5 text-n-600">{row.runs}</td>
                      <td className="num px-3 py-2.5 text-n-600">{row.detected}</td>
                      <td className="px-3 py-2.5">
                        <span className="num font-semibold text-pass-ink">
                          {(row.detectionRate * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* histogram + comparison */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHead step="C" title="Mismatch distribution">
            <span className="micro text-n-500">GET /api/stats/histogram</span>
          </SectionHead>
          <Panel className="p-5">
            {histogram.loading && <div className="skeleton h-40 w-full" />}
            {histogram.data && <HistogramChart data={histogram.data} />}
          </Panel>
        </div>
        <div>
          <SectionHead step="D" title="Classical vs. quantum">
            <span className="micro text-n-500">GET /api/stats/forgery-comparison</span>
          </SectionHead>
          <Panel className="p-5">
            {forgery.loading && <div className="skeleton h-40 w-full" />}
            {forgery.data && (
              <ComparisonBar
                label="Forgery probability"
                unit="probability"
                rows={[
                  {
                    name: forgery.data.classicalLabel,
                    value: forgery.data.classical,
                    tone: "primary",
                  },
                  { name: forgery.data.quantumLabel, value: forgery.data.quantum, tone: "pass" },
                ]}
                format={probability}
              />
            )}
          </Panel>
        </div>
      </div>

      {/* verifier agreement + partial analysis */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHead step="E" title="Verifier agreement">
            <span className="micro text-n-500">GET /api/stats/summary</span>
          </SectionHead>
          <Panel className="p-5">
            {summary.data?.verifierAgreementRate === undefined ? (
              <EmptyState title="Not reported by the backend">
                The summary endpoint does not include a verifier-agreement rate,
                so the dashboard leaves the card empty instead of estimating one.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <DataCard
                  label="Runs where every verifier agreed"
                  value={pct(summary.data.verifierAgreementRate, 1)}
                  tone="pass"
                />
                <p className="text-[14px] leading-relaxed text-on-surface">
                  When verifiers disagree, the run is marked disputed and routed
                  to the arbitration view rather than silently taking a
                  majority.
                </p>
              </div>
            )}
          </Panel>
        </div>

        <div>
          <SectionHead step="F" title="Partial attack analysis">
            <span className="micro text-n-500">attack size vs. detection</span>
          </SectionHead>
          <Panel className="p-5">
            <EmptyState title="Data unavailable">
              Detection rate as a function of attack fraction needs a
              per-run attack-fraction field. The contract does not expose one
              yet, so this panel stays empty instead of showing a curve that
              was never computed.
            </EmptyState>
            <div className="mt-4">
              <p className="micro text-n-500">What the log already shows</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-on-surface">
                Partial attacks are the only scenario in the table above with a
                detection rate well under 100% — small perturbations can stay
                under the threshold. Every individual partial run and its
                measured mismatch is on the event log.
              </p>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-8">
        <ErrorBanner error={error} />
      </div>
    </div>
  );
}

/** Overlaid honest (teal) vs attacked (red) bars. */
function HistogramChart({ data }: { data: HistogramResponse }) {
  const max = Math.max(...data.honest, ...data.attacked, 1);
  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {data.bins.map((bin, i) => (
          <div key={bin} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-0.5">
              <div
                className="w-1/3 rounded-t bg-secondary"
                style={{ height: `${(data.honest[i] / max) * 100}%` }}
                title={`honest: ${data.honest[i]}`}
              />
              <div
                className="w-1/3 rounded-t bg-fail"
                style={{ height: `${(data.attacked[i] / max) * 100}%` }}
                title={`attacked: ${data.attacked[i]}`}
              />
            </div>
            <span className="num text-center text-[12px] leading-tight text-n-500">{bin}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[12px] text-n-600">
          <span className="size-2.5 rounded-[1px] bg-secondary" /> honest
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-n-600">
          <span className="size-2.5 rounded-[1px] bg-fail" /> attacked
        </span>
      </div>
    </div>
  );
}
