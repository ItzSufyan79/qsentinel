/**
 * Display-only formatting. Nothing here derives a scientific value — it turns
 * numbers the backend already sent into the strings the UI shows, and it maps
 * a backend enum to the words a reader needs.
 */

import { STAGES, type StageId } from "../api/types";

/** A rate the backend sent as a fraction, shown as a percentage. */
export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** A rate the backend sent as a fraction, shown at fixed precision. */
export function rate(value: number, digits = 4): string {
  return value.toFixed(digits);
}

/** Small values read better in scientific notation than as "0.000000". */
export function probability(value: number): string {
  if (value === 0) return "0";
  if (value >= 0.001) return value.toFixed(3);
  return value.toExponential(1);
}

/** "02" … "06" badge for a stage. */
export function stageNum(id: StageId): string {
  return STAGES.find((s) => s.id === id)?.num.toString().padStart(2, "0") ?? id;
}

export function stageLabel(id: StageId): string {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

/** "2026-09-28" -> "28 Sep 2026", for date filters and log rows. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** "2026-09-28T09:14:02Z" -> "28 Sep, 09:14", for log rows. */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}