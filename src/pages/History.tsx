/**
 * Page 5 — Run History (report section 8). Table of runs plus a per-attack
 * detection summary strip; empty state links to New Simulation.
 */

import { Link } from "react-router-dom";
import { api } from "../api";
import { attackLabel } from "../api/types";
import { useApi } from "../lib/useApi";
import { shortDateTime } from "../lib/formatting";
import { Icon, Outcome, EmptyState } from "../components/ui/atoms";

function severityTone(s: number) {
  return s === 0 ? "honest" : s <= 3 ? "pending" : s <= 6 ? "warn" : "attack";
}

export function HistoryPage() {
  const { data, error, loading } = useApi(() => api.getHistory(), []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded bg-n-200" />
        <div className="mt-6 h-64 animate-pulse rounded-[var(--qs-r)] bg-n-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <EmptyState title="Could not load history">
          {error.message}{" "}
          <Link to="/simulate" className="text-accent-ink underline decoration-dotted">
            Start a new simulation
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  const runs = data?.runs ?? [];
  const byAttack = data?.byAttack ?? [];

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="display text-[12px] tracking-[0.18em] text-accent-ink uppercase">Reproducibility</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">Run history</h1>
        </div>
        <Link to="/simulate" className="btn btn-primary">
          New simulation <Icon name="arrow-right" size={15} />
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nothing here yet">
            No runs recorded. Launch one from the New Simulation page and it will appear here, with its seed, so any run can be reproduced.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {/* per-attack detection summary */}
          <section className="card-muted p-5">
            <p className="display text-[13px] font-medium tracking-[0.06em] text-n-500 uppercase">
              Detection summary
            </p>
            <table className="mt-3 w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-outline text-left text-[12px] text-n-500 uppercase">
                  <th className="py-1.5 pr-3 font-display">Attack</th>
                  <th className="py-1.5 pr-3 text-right font-display">Runs</th>
                  <th className="py-1.5 pr-3 text-right font-display">Detected</th>
                  <th className="py-1.5 pr-3 text-right font-display">Mean severity</th>
                </tr>
              </thead>
              <tbody>
                {byAttack.map((row) => (
                  <tr key={row.attack} className="border-b border-outline last:border-0">
                    <td className="py-2 pr-3 font-medium text-ink">{attackLabel(row.attack as never)}</td>
                    <td className="num py-2 pr-3 text-right text-n-600">{row.runs}</td>
                    <td className="num py-2 pr-3 text-right text-n-600">
                      {row.detected}/{row.runs}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="chip" data-tone={severityTone(row.meanSeverity)}>
                        {row.meanSeverity.toFixed(1)} / 10
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* runs table */}
          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-outline bg-n-100 text-left text-[12px] text-n-500 uppercase">
                  {["Time", "Attack", "Target", "Verdict", "Severity", ""].map((h) => (
                    <th key={h} className="px-4 py-2 font-display">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.sessionId} className="border-b border-outline last:border-0 hover:bg-n-100">
                    <td className="num px-4 py-2 text-n-500">{shortDateTime(r.timestamp)}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-ink">{attackLabel(r.attack as never)}</span>
                      {r.subtype && <span className="micro ml-2 text-n-500">{r.subtype}</span>}
                    </td>
                    <td className="px-4 py-2 text-n-600">
                      {r.targetLink === "both" ? "Bob & Charlie" : r.targetLink ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Outcome ok={r.verdict === "ACCEPTED"}>{r.verdict}</Outcome>
                    </td>
                    <td className="px-4 py-2">
                      <span className="chip" data-tone={severityTone(r.severity)}>{r.severity} / 10</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        to={`/results/${r.sessionId}`}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline"
                      >
                        Open <Icon name="arrow-right" size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="micro border-t border-outline px-4 py-3 text-n-500">
              Every run stores its seed — "Run again" on a dashboard reproduces the exact scenario.
              {runs.length} runs shown.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}