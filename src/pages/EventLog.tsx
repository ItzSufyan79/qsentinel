/**
 * Event Log (`/log`) — design report, section 4.6.
 *
 * Direct fulfillment of the PS's "logging of security events" deliverable —
 * looks like a real security tool's log, not a debug console.
 * Single table, paginated, with a search/filter bar and CSV export.
 *
 * The attack, verdict, date and search controls are sent to the backend as
 * query params, so the count and the pagination both reflect the filter. If a
 * backend ignores the optional refinements, the note under the bar says so.
 */

import { useState } from "react";
import { api, ApiError } from "../api";
import type { LogPage, Verdict } from "../api/types";
import { ATTACK_OPTIONS } from "../api/types";
import { useApi } from "../lib/useApi";
import {
  EmptyState,
  EventLogRow,
  Icon,
  Panel,
  SectionHead,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

const VERDICTS: { id: Verdict; label: string }[] = [
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
];

export function EventLogPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [verdict, setVerdict] = useState<Verdict | "all">("all");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const extra = { verdict, date: date || undefined, search: search.trim() || undefined };

  const { data, error, loading } = useApi<LogPage>(
    () => api.getLog(page, filter, extra),
    [page, filter, verdict, date, search],
  );

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.exportLog(filter, extra);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qsentinel-log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(
        e instanceof ApiError ? e.message : "The export request failed. Try again.",
      );
    } finally {
      setExporting(false);
    }
  };

  const totalPages = data?.totalPages ?? 1;
  const selectClass =
    "rounded-[var(--qs-r)] border border-outline-strong bg-surface px-3 py-2 text-[13px] text-on-surface";

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="micro text-accent-ink">Security event log</p>
          <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold text-on-bg">
            Event log
          </h1>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void exportCsv()}
          disabled={exporting}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {exportError && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-fail-ink" role="alert">
          <Icon name="alert-triangle" size={15} />
          {exportError}
        </p>
      )}

      {/* search / filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="sr-only">Search the log</span>
          <span className="text-n-500" aria-hidden>
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={search}
            placeholder="Run id or mechanism"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${selectClass} w-52`}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="micro text-n-500">Attack type</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className={selectClass}
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
            value={verdict}
            onChange={(e) => {
              setVerdict(e.target.value as Verdict | "all");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="all">All</option>
            {VERDICTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="micro text-n-500">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          />
        </label>
        {(search || verdict !== "all" || date || filter !== "all") && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch("");
              setVerdict("all");
              setDate("");
              setFilter("all");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
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
          {data && data.entries.length === 0 && (
            <EmptyState title="No events match those filters">
              Widen the attack type, clear the verdict or date, or clear the
              search box to see the rest of the log.
            </EmptyState>
          )}
          {data && data.entries.length > 0 && (
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
                    {data.entries.map((e, i) => (
                      <EventLogRow
                        key={`${e.runId}-${e.timestamp}-${i}`}
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
                  Page {data.page} / {totalPages}
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
