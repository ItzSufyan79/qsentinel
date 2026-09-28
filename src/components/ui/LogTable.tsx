/**
 * System log viewer — report tab. Alias + timeline + severity all come from
 * the backend; this component only renders and filters. Each row is
 * time · stage · actor · event · message, with an expandable raw payload.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { LogFilters, LogLevel, LogRow, StageId } from "../../api/types";
import { useDebounced } from "../../lib/useDebounced";
import { stageLabel } from "../../lib/formatting";
import { Icon } from "./atoms";
import type { IconName } from "../../lib/iconNames";

const ACTOR_ICON: Record<LogRow["actor"], IconName> = {
  alice: "sparkles",
  bob: "user-check",
  charlie: "user-check",
  eve: "bug",
  system: "settings",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "Info",
  check: "Check",
  attack: "Attack",
};

const STAGE_OPTIONS: (StageId | "all")[] = ["all", "fidelity", "keys", "distribute", "sign", "verify", "analysis"];
const ACTOR_OPTIONS: (LogRow["actor"] | "all")[] = ["all", "alice", "bob", "charlie", "eve", "system"];
const LEVEL_OPTIONS: (LogLevel | "all")[] = ["all", "info", "check", "attack"];

export function LogTable({ runId, className = "" }: { runId: string; className?: string }) {
  const [filters, setFilters] = useState<LogFilters>({ stage: "all", actor: "all", level: "all", q: "" });
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [followAttack, setFollowAttack] = useState(false);

  const q = useDebounced(filters.q ?? "", 250);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getLogs(runId, { ...filters, q: q || undefined })
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Logs unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, filters.stage, filters.actor, filters.level, q]);

  const code = (r: LogRow) => r.code;
  const visible = useMemo(
    () => (followAttack ? rows.filter((r) => r.level === "attack") : rows).slice(0, 500),
    [rows, followAttack],
  );

  const set = (patch: Partial<LogFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const download = () => {
    const body = visible
      .map((r) => [r.timeMs, r.stage, r.actor, r.code, r.level, r.message].join("\t"))
      .join("\n");
    const blob = new Blob([body], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${runId}-logs.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAll = async () => {
    const body = visible.map((r) => `${r.timeMs}ms ${r.stage} ${r.actor} ${r.code}: ${r.message}`).join("\n");
    await navigator.clipboard.writeText(body);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "stage", label: "Stage", options: STAGE_OPTIONS },
            { key: "actor", label: "Actor", options: ACTOR_OPTIONS },
            { key: "level", label: "Level", options: LEVEL_OPTIONS },
          ] as const
        ).map(({ key, label, options }) => (
          <label key={key} className="flex items-center gap-1.5 text-[12px] text-n-500">
            <span className="display uppercase">{label}</span>
            <select
              value={filters[key] ?? "all"}
              onChange={(e) => set({ [key]: e.target.value })}
              className="qs-select"
              aria-label={label}
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="relative ml-2 flex items-center">
          <input
            value={filters.q ?? ""}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="search messages…"
            className="qs-input !py-1.5 qs-input-sm"
            aria-label="Search log messages"
          />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copyAll}>
          <Icon name="clipboard" size={14} /> Copy
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={download}>
          <Icon name="download" size={14} /> Download
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-n-500">
          <input type="checkbox" checked={followAttack} onChange={(e) => setFollowAttack(e.target.checked)} className="accent-[var(--qs-fail)]" />
          Follow the attack
        </label>
      </div>

      {error && <p className="text-[13px] text-fail-ink">{error}</p>}

      <div className="overflow-hidden rounded-[var(--qs-r)] border border-outline">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-n-100 text-left">
              {["Time", "Stage", "Actor", "Event", "Message"].map((h) => (
                <th key={h} className="display px-3 py-2 text-[12px] tracking-[0.06em] text-n-500 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-n-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-n-500">
                  No matching events.
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((r) => {
                const rowKey = `${r.timeMs}-${r.code}-${r.stage}-${r.actor}-${r.message}`;
                const open = expanded.has(rowKey);
                const level = r.level;
                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={`border-b border-outline last:border-0 ${level === "attack" ? "bg-fail-tint" : "hover:bg-n-100"}`}
                      aria-expanded={open}
                    >
                      <td className="num whitespace-nowrap px-3 py-2 text-n-500">{r.timeMs}ms</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-n-600">{stageLabel(r.stage)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-n-600">
                          <Icon name={ACTOR_ICON[r.actor]} size={14} className="text-n-500" />
                          <span className="display uppercase">{r.actor}</span>
                        </span>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-n-600">{code(r)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 text-left"
                          onClick={() =>
                            setExpanded((s) => {
                              const next = new Set(s);
                              if (next.has(rowKey)) next.delete(rowKey);
                              else next.add(rowKey);
                              return next;
                            })
                          }
                        >
                          <span
                            className={`chip ${level === "check" ? "chip-pass" : level === "attack" ? "chip-fail" : "chip-neutral"}`}
                          >
                            {LEVEL_LABEL[level]}
                          </span>
                          <span className="w-full">{r.message}</span>
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-outline bg-n-100/50">
                        <td colSpan={5} className="px-3 py-2">
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-[12px] text-n-600">
                            {JSON.stringify(r.payload ?? null, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="micro text-n-500">
        Showing {visible.length} events {followAttack ? "— attack-level only" : "(latest 500)"}. Verified: Bob · Charlie.
      </p>
    </div>
  );
}