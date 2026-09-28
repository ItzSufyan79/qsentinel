/**
 * Event Log (`/log`) — design report, section 4.6.
 *
 * Direct fulfillment of the PS's "logging of security events" deliverable —
 * looks like a real security tool's log, not a debug console.
 * Single table, paginated, with a search/filter bar and CSV export.
 */

import { useState } from "react";
import { api } from "../api";
import type { LogPage } from "../api/types";
import { ATTACK_OPTIONS } from "../api/types";
import { useApi } from "../lib/useApi";
import {
  EventLogRow,
  Panel,
  SectionHead,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

export function EventLogPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState("all");

  const { data, error, loading } = useApi<LogPage>(
    () => api.getLog(page, filter),
    [page, filter],
  );

  const exportCsv = async () => {
    const blob = await api.exportLog(filter);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qsentinel-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="micro text-primary">Security event log</p>
          <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold text-on-bg">
            Event log
          </h1>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void exportCsv()}
        >
          Export CSV
        </button>
      </div>

      {/* search / filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="micro text-n-500">Attack type</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
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
          <span className="micro text-n-500">Verdict</span>
          <select
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value)}
            className="rounded-[var(--qs-r)] border border-outline-strong bg-surface px-3 py-2 text-[13px] text-on-surface"
          >
            <option value="all">All</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        {data && (
          <span className="num ml-auto text-[13px] text-n-500">
            {data.total} event{data.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-4">
        <SectionHead step="A" title="Events">
          <span className="micro text-n-500">GET /api/log</span>
        </SectionHead>
        <Panel>
          {loading && <div className="skeleton h-48 w-full" />}
          {error && <ErrorBanner error={error} />}
          {data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-outline-strong text-left">
                      {["Timestamp", "Attack type", "Run", "Verdict", "Flagged by"].map(
                        (h) => (
                          <th
                            key={h}
                            className="display px-3 py-2.5 font-medium tracking-[0.04em] text-n-500 uppercase"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries
                      .filter(
                        (e) =>
                          verdictFilter === "all" || e.verdict === verdictFilter,
                      )
                      .map((e, i) => (
                        <EventLogRow
                          key={`${e.runId}-${i}`}
                          timestamp={e.timestamp}
                          attackType={e.attackType}
                          runId={e.runId}
                          verdict={e.verdict}
                          flaggedBy={e.flaggedBy}
                          detected={e.detected}
                        />
                      ))}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div className="mt-4 flex items-center justify-between border-t border-outline pt-4">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="num text-[13px] text-n-500">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </Panel>
      </div>

      <p className="mt-4 text-[13px] text-n-500">
        Rows with a red left-border are detected attacks. Run ids link back to
        the Results page.
      </p>
    </div>
  );
}
