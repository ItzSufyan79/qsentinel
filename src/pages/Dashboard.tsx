/**
 * Analytics Dashboard (`/dashboard`) — design report, section 4.5.
 *
 * The cumulative view — this is what turns a one-off demo into "a system."
 * Grid of cards + two charts + the comparison bar, with a filter row.
 */

import { useState } from "react";
import { api } from "../api";
import type {
  ByAttackTypeRow,
  ForgeryComparison,
  HistogramResponse,
  StatsSummary,
} from "../api/types";
import { ATTACK_OPTIONS } from "../api/types";
import { useApi } from "../lib/useApi";
import {
  ComparisonBar,
  DataCard,
  Panel,
  SectionHead,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

export function DashboardPage() {
  const [attackFilter, setAttackFilter] = useState("all");
  const [range, setRange] = useState("all");

  const summary = useApi<StatsSummary>(() => api.getStatsSummary(), []);
  const byAttack = useApi<ByAttackTypeRow[]>(() => api.getByAttackType(), []);
  const histogram = useApi<HistogramResponse>(() => api.getHistogram(), []);
  const forgery = useApi<ForgeryComparison>(() => api.getForgeryComparison(), []);

  const error = summary.error ?? byAttack.error ?? histogram.error ?? forgery.error;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="micro text-primary">Cumulative view</p>
      <h1 className="mt-2 font-condensed text-[28px] leading-tight font-semibold text-on-bg">
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
        <label className="flex items-center gap-2">
          <span className="micro text-n-500">Date range</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-[var(--qs-r)] border border-outline-strong bg-surface px-3 py-2 text-[13px] text-on-surface"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
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
          {byAttack.data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-outline-strong text-left">
                    {["Attack type", "Runs", "Detected", "Detection rate"].map((h) => (
                      <th key={h} className="condensed px-3 py-2.5 font-medium tracking-[0.04em] text-n-500 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byAttack.data.map((row) => (
                    <tr key={row.attackType} className="border-b border-outline last:border-0">
                      <td className="px-3 py-2.5 text-on-surface">{row.label}</td>
                      <td className="num px-3 py-2.5 text-n-600">{row.runs}</td>
                      <td className="num px-3 py-2.5 text-n-600">{row.detected}</td>
                      <td className="px-3 py-2.5">
                        <span className="num font-semibold text-pass">
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
            {histogram.data && (
              <HistogramChart data={histogram.data} />
            )}
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
                left={forgery.data.classical}
                right={forgery.data.quantum}
                leftLabel={forgery.data.classicalLabel}
                rightLabel={forgery.data.quantumLabel}
                format={(v) => (v < 0.001 ? v.toExponential(0) : v.toFixed(2))}
              />
            )}
          </Panel>
        </div>
      </div>

      <ErrorBanner error={error} />
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
            <span className="num text-center text-[10px] text-n-500">{bin}</span>
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
