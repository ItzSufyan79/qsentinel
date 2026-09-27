/**
 * Mock backend for the QSentinel contract.
 *
 * Every number the UI shows originates here, so swapping in the real server
 * means replacing this module and nothing else. The simulation physics
 * (block structure, failure rates, forgery curve) is deterministic given the
 * seed, so a run is reproducible from a shared link.
 */

import type {
  ActiveResponse,
  ArbitrationResponse,
  AttackOption,
  AttackTypeId,
  BlockResult,
  ByAttackTypeRow,
  DistributionResponse,
  ForgeryComparison,
  HistogramResponse,
  KeygenResponse,
  LogEntry,
  LogPage,
  PreviewResponse,
  ResultResponse,
  RunResponse,
  SignResponse,
  StatsSummary,
  VerifierResult,
} from "./types";
import { ApiError as ApiErrorClass, ATTACK_OPTIONS, attackLabel } from "./types";
import type { QdsApi, RunContext } from "./contract";
import { VERIFIER_NAMES, mulberry32 } from "../lib/rng";
import { sleep as libSleep } from "../lib/async";


/* ------------------------------------------------------------------ *
 *  Protocol constants
 * ------------------------------------------------------------------ */

const BLOCKS = 63;
const SLOTS_PER_BLOCK = 128;
const BAGS_PER_POSITION = 2;
const CODEWORD_POSITIONS = 63;
const TOTAL_SLOTS = CODEWORD_POSITIONS * BAGS_PER_POSITION * SLOTS_PER_BLOCK;
const BLOCK_THRESHOLD = 12;

function sleep(ms: number, ctx: RunContext = {}): Promise<void> {
  return libSleep(ms, { signal: ctx.signal, speed: ctx.speed });
}

/* ------------------------------------------------------------------ *
 *  Run state — the mock has to remember runs between calls
 * ------------------------------------------------------------------ */

interface MockRun {
  runId: string;
  attack: AttackTypeId;
  n: number;
  threshold: number;
  verifierCount: number;
  seed: number;
  message: string;
  createdAt: number;
}

const runs = new Map<string, MockRun>();
let activeRunId: string | null = null;

function makeRunId(): string {
  return `run-${Math.random().toString(36).slice(2, 8)}`;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function failureRateFor(attack: AttackTypeId, intensity: number): number {
  switch (attack) {
    case "honest":
      return 0;
    case "forgery":
    case "impersonation":
      return 0.42;
    case "replay":
      return 0.3;
    case "intercept-fixed":
      return 0.34;
    case "intercept-random":
      return 0.18;
    case "tampering":
      return 0.5;
    case "partial":
      return 0.05 + (intensity / 100) * 0.6;
    case "collusion":
      return 0.22;
  }
}

interface PlannedBlock {
  verifier: string;
  block: BlockResult;
}

/** Computed up-front from the seed so a skip can jump to the end. */
function planVerification(
  verifierNames: string[],
  attack: AttackTypeId,
  intensity: number,
  seed: number,
): { plan: PlannedBlock[]; results: VerifierResult[] } {
  const plan: PlannedBlock[] = [];
  const results: VerifierResult[] = [];

  for (const [vi, verifier] of verifierNames.entries()) {
    let failed = 0;
    const vrand = mulberry32(seed + vi * 7919);
    const rate = failureRateFor(attack, intensity);

    const blocks: BlockResult[] = Array.from({ length: BLOCKS }, (_, i) => {
      const willFail = vrand() < rate;
      const mismatches = willFail
        ? BLOCK_THRESHOLD + 1 + Math.floor(vrand() * 14)
        : Math.floor(vrand() * BLOCK_THRESHOLD);
      if (willFail) failed += 1;
      return {
        index: i,
        mismatches,
        threshold: BLOCK_THRESHOLD,
        slotCount: SLOTS_PER_BLOCK,
        status: willFail ? "fail" : "pass",
      };
    });

    blocks.forEach((block) => plan.push({ verifier, block }));
    results.push({ name: verifier, checked: 0, total: BLOCKS, failed: 0, verdict: "pending" });
  }

  return { plan, results };
}

const findRun = (runId: string): MockRun => {
  const run = runs.get(runId);
  if (!run) throw new ApiErrorClass("RUN_NOT_FOUND", `No run ${runId}`, 404);
  return run;
};

/* ------------------------------------------------------------------ *
 *  QdsApi implementation
 * ------------------------------------------------------------------ */

export const mockApi: QdsApi = {
  async getActive(): Promise<ActiveResponse> {
    await sleep(60);
    const run = activeRunId ? runs.get(activeRunId) : null;
    return {
      active: run !== undefined && run !== null,
      runId: activeRunId,
      phase: run ? "verification" : null,
    };
  },

  async preview(attack, n): Promise<PreviewResponse> {
    await sleep(120);
    return {
      attackType: attack,
      n,
      threshold: 0.1,
      predictedDetectionConfidence:
        attack === "honest" ? 0 : Number((0.55 + Math.min(0.4, n / 4000)).toFixed(2)),
    };
  },

  async createRun(attack, n, threshold, verifierCount): Promise<RunResponse> {
    await sleep(320);
    const run: MockRun = {
      runId: makeRunId(),
      attack,
      n,
      threshold,
      verifierCount,
      seed: Math.floor(Math.random() * 1e9),
      message: "",
      createdAt: Date.now(),
    };
    runs.set(run.runId, run);
    activeRunId = run.runId;
    return {
      runId: run.runId,
      attackType: attack,
      n,
      threshold,
      seed: run.seed,
    };
  },

  async getKeygen(runId): Promise<KeygenResponse> {
    findRun(runId);
    await sleep(260);
    return {
      runId,
      totalSlots: TOTAL_SLOTS,
      slotsPerBlock: SLOTS_PER_BLOCK,
      blocks: BLOCKS,
      bagsPerPosition: BAGS_PER_POSITION,
      codewordPositions: CODEWORD_POSITIONS,
    };
  },

  async getDistribution(runId): Promise<DistributionResponse> {
    const run = findRun(runId);
    await sleep(220);
    return {
      runId,
      verifiers: VERIFIER_NAMES.slice(0, run.verifierCount).map((name) => ({
        name,
        received: TOTAL_SLOTS,
        total: TOTAL_SLOTS,
        done: true,
      })),
    };
  },

  async getSigning(runId): Promise<SignResponse> {
    const run = findRun(runId);
    await sleep(280);
    const rand = mulberry32(run.seed ^ hashString(run.message || "message"));
    const encoded = Array.from({ length: BLOCKS }, () =>
      rand() > 0.5 ? "1" : "0",
    ).join("");
    return {
      runId,
      signatureId: `SIG-${hashString(run.message || "message").toString(16).toUpperCase().padStart(8, "0")}`,
      message: run.message,
      encoded,
      encodedLength: BLOCKS,
      blocksOpened: BLOCKS,
      sentTo: VERIFIER_NAMES.slice(0, run.verifierCount),
    };
  },

  async streamVerification(runId, onEvent, ctx = {}): Promise<VerifierResult[]> {
    const run = findRun(runId);
    const names = VERIFIER_NAMES.slice(0, run.verifierCount);
    const { plan, results } = planVerification(
      names,
      run.attack,
      50,
      run.seed,
    );

    for (const entry of plan) {
      await sleep(18, ctx);
      const result = results.find((r) => r.name === entry.verifier);
      if (!result) continue;
      result.checked += 1;
      if (entry.block.status === "fail") result.failed += 1;
      if (result.checked >= result.total) {
        result.verdict = result.failed > 0 ? "rejected" : "accepted";
      }
      onEvent({
        verifier: entry.verifier,
        block: { ...entry.block },
        checked: result.checked,
        result: { ...result },
      });
    }
    return results.map((r) => ({ ...r }));
  },

  async getResult(runId): Promise<ResultResponse> {
    const run = findRun(runId);
    await sleep(180);
    const names = VERIFIER_NAMES.slice(0, run.verifierCount);
    const { results } = planVerification(names, run.attack, 50, run.seed);
    // resolve verdicts
    for (const r of results) r.verdict = r.failed > 0 ? "rejected" : "accepted";

    const totalChecked = results.reduce((s, r) => s + r.total, 0);
    const totalMismatch = results.reduce((s, r) => s + r.failed, 0);
    const mismatchRate = totalChecked ? totalMismatch / totalChecked : 0;
    const anyRejected = results.some((r) => r.verdict === "rejected");

    const flaggedBy: ResultResponse["flaggedBy"] =
      run.attack === "honest"
        ? "none"
        : run.attack === "collusion"
          ? "verifier-cross-check"
          : mismatchRate > 0.15
            ? "quantum-error-rate"
            : "classical-mac";

    return {
      runId,
      verdict: anyRejected ? "rejected" : "accepted",
      mismatchRate: Number(mismatchRate.toFixed(4)),
      threshold: BLOCK_THRESHOLD / SLOTS_PER_BLOCK,
      confidence: anyRejected
        ? "this error rate has a 1-in-10^4 chance under an honest run"
        : "consistent with an honest run",
      flaggedBy,
      flaggedDiff:
        run.attack === "honest" || run.attack === "collusion"
          ? undefined
          : [
              { sent: "01101001…", received: "01101101…" },
              { sent: "basis: Z", received: "basis: X" },
            ],
      verifiers: results,
    };
  },

  async getArbitration(runId): Promise<ArbitrationResponse> {
    const run = findRun(runId);
    await sleep(200);
    const [v1, v2] = VERIFIER_NAMES;
    return {
      runId,
      verifiers: [
        { name: v1, mismatchRate: 0.04, verdict: "accepted", timestamp: new Date(run.createdAt + 8200).toISOString() },
        { name: v2, mismatchRate: 0.31, verdict: "rejected", timestamp: new Date(run.createdAt + 8400).toISOString() },
      ],
      crossCheckStatus: "diverged",
      arbiterRuling: `${v2}'s report is inconsistent with ${v1}'s independent measurement; the cross-check comparison diverged, so ${v1}'s accepted verdict stands.`,
    };
  },

  async getStatsSummary(): Promise<StatsSummary> {
    await sleep(160);
    return {
      totalRuns: 1284,
      detectionRate: 0.982,
      avgMismatchHonest: 0.071,
      avgMismatchAttacked: 0.384,
    };
  },

  async getByAttackType(): Promise<ByAttackTypeRow[]> {
    await sleep(160);
    const rows: ByAttackTypeRow[] = [
      { attackType: "honest", label: attackLabel("honest"), runs: 402, detected: 0, detectionRate: 0 },
      { attackType: "forgery", label: attackLabel("forgery"), runs: 188, detected: 188, detectionRate: 1 },
      { attackType: "impersonation", label: attackLabel("impersonation"), runs: 121, detected: 119, detectionRate: 0.98 },
      { attackType: "replay", label: attackLabel("replay"), runs: 96, detected: 94, detectionRate: 0.98 },
      { attackType: "intercept-fixed", label: attackLabel("intercept-fixed"), runs: 143, detected: 141, detectionRate: 0.99 },
      { attackType: "intercept-random", label: attackLabel("intercept-random"), runs: 117, detected: 104, detectionRate: 0.89 },
      { attackType: "partial", label: attackLabel("partial"), runs: 132, detected: 97, detectionRate: 0.73 },
      { attackType: "tampering", label: attackLabel("tampering"), runs: 84, detected: 84, detectionRate: 1 },
      { attackType: "collusion", label: attackLabel("collusion"), runs: 1, detected: 1, detectionRate: 1 },
    ];
    return rows;
  },

  async getHistogram(): Promise<HistogramResponse> {
    await sleep(160);
    const bins = ["0.00–0.05", "0.05–0.10", "0.10–0.15", "0.15–0.20", "0.20–0.30", "0.30+"];
    return {
      bins,
      honest: [402, 0, 0, 0, 0, 0],
      attacked: [2, 9, 24, 61, 188, 118],
    };
  },

  async getForgeryComparison(): Promise<ForgeryComparison> {
    await sleep(140);
    return {
      classical: 0.5,
      quantum: 1e-9,
      classicalLabel: "RSA / ECC at 128-bit security",
      quantumLabel: "Teleportation-based QDS at 63 blocks",
    };
  },

  async getLog(page, filter): Promise<LogPage> {
    await sleep(140);
    const all: LogEntry[] = [
      { timestamp: "2026-09-28 14:02:11", attackType: "honest", label: attackLabel("honest"), runId: "run-a1b2c3", verdict: "accepted", flaggedBy: "none", detected: false },
      { timestamp: "2026-09-28 14:05:47", attackType: "forgery", label: attackLabel("forgery"), runId: "run-d4e5f6", verdict: "rejected", flaggedBy: "quantum-error-rate", detected: true },
      { timestamp: "2026-09-28 14:09:03", attackType: "intercept-fixed", label: attackLabel("intercept-fixed"), runId: "run-g7h8i9", verdict: "rejected", flaggedBy: "quantum-error-rate", detected: true },
      { timestamp: "2026-09-28 14:12:38", attackType: "replay", label: attackLabel("replay"), runId: "run-j1k2l3", verdict: "rejected", flaggedBy: "classical-mac", detected: true },
      { timestamp: "2026-09-28 14:16:52", attackType: "impersonation", label: attackLabel("impersonation"), runId: "run-m4n5o6", verdict: "rejected", flaggedBy: "quantum-error-rate", detected: true },
      { timestamp: "2026-09-28 14:20:19", attackType: "honest", label: attackLabel("honest"), runId: "run-p7q8r9", verdict: "accepted", flaggedBy: "none", detected: false },
      { timestamp: "2026-09-28 14:24:44", attackType: "tampering", label: attackLabel("tampering"), runId: "run-s1t2u3", verdict: "rejected", flaggedBy: "quantum-error-rate", detected: true },
      { timestamp: "2026-09-28 14:28:07", attackType: "intercept-random", label: attackLabel("intercept-random"), runId: "run-v4w5x6", verdict: "rejected", flaggedBy: "quantum-error-rate", detected: true },
      { timestamp: "2026-09-28 14:31:30", attackType: "partial", label: attackLabel("partial"), runId: "run-y7z8a1", verdict: "rejected", flaggedBy: "quantum-error-rate", detected: true },
    ];
    const filtered = filter === "all" ? all : all.filter((e) => e.attackType === filter);
    return { entries: filtered, page, totalPages: 1, total: filtered.length };
  },

  async exportLog(): Promise<Blob> {
    await sleep(120);
    const header = "timestamp,attack_type,run_id,verdict,flagged_by\n";
    return new Blob([header], { type: "text/csv" });
  },
};

/* ------------------------------------------------------------------ *
 *  Exported helpers for the store
 * ------------------------------------------------------------------ */

export function setActiveRun(runId: string | null): void {
  activeRunId = runId;
}

export function setRunMessage(runId: string, message: string): void {
  const run = runs.get(runId);
  if (run) run.message = message;
}

export function attackOption(id: AttackTypeId): AttackOption {
  return ATTACK_OPTIONS.find((a) => a.id === id) ?? ATTACK_OPTIONS[0]!;
}

export function getRunAttack(runId: string): AttackTypeId {
  return runs.get(runId)?.attack ?? "honest";
}

export function getVerifierNames(count: number): string[] {
  return VERIFIER_NAMES.slice(0, count);
}
