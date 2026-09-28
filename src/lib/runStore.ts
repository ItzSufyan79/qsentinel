/**
 * Persisted current-run context. The live page needs the attack configuration
 * from the very first frame (report 6.2, attack badge), but the §11 contract
 * has no "get run config" route — so creation stores it here, and refresh-safe
 * navigation survives reloads. Not an API; not scientific data.
 */

import type { RunConfig } from "../api/types";

export interface StoredRun {
  sessionId: string;
  seed: number;
  config: RunConfig;
  createdAt: string;
}

const LAST_KEY = "qs:last-run";

function readAll(): Record<string, StoredRun> {
  try {
    const raw = localStorage.getItem("qs:runs");
    return raw ? (JSON.parse(raw) as Record<string, StoredRun>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, StoredRun>) {
  try {
    localStorage.setItem("qs:runs", JSON.stringify(map));
  } catch {
    /* private mode — session persistence is best-effort */
  }
}

export function saveRun(run: StoredRun) {
  const map = readAll();
  map[run.sessionId] = run;
  writeAll(map);
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(run));
  } catch {
    /* ignore */
  }
}

export function getRun(sessionId: string): StoredRun | null {
  return readAll()[sessionId] ?? null;
}

export function getLastRun(): StoredRun | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as StoredRun) : null;
  } catch {
    return null;
  }
}