import type {
  Agreement,
  AnalyticsPoint,
  AttackId,
  AttackResponse,
  BlockResult,
  ChannelHealthResponse,
  DashboardReport,
  DistributeResponse,
  FingerprintAxis,
  FingerprintLegendEntry,
  InitResponse,
  KeygenResponse,
  LogEntry,
  SignResponse,
  VerifierResult,
  VerifyEvent,
} from "./types";
import { VERIFIER_NAMES, mulberry32 } from "../lib/rng";
import { sleep as libSleep } from "../lib/async";

/* ------------------------------------------------------------------ *
 * Mock backend. Every number the UI shows originates here, so swapping
 * in the real server means replacing this module and nothing else.
 * ------------------------------------------------------------------ */

export interface RunContext {
  signal?: AbortSignal;
  /** 1 = normal demo speed, ~0.1 = fast-forward */
  speed?: () => number;
}

const BLOCKS = 63;
const SLOTS_PER_BLOCK = 128;
const BAGS_PER_POSITION = 2;
const CODEWORD_POSITIONS = 63;
const TOTAL_SLOTS = CODEWORD_POSITIONS * BAGS_PER_POSITION * SLOTS_PER_BLOCK;
const BLOCK_THRESHOLD = 12;

function sleep(ms: number, ctx: RunContext = {}): Promise<void> {
  return libSleep(ms, { signal: ctx.signal, speed: ctx.speed });
}

/* ----------------------------- catalogue ----------------------------- */

const HARDWARE_PROFILE = {
  label: "Standard Fiber Link — 10km",
  stats: [
    { label: "Expected noise", value: "2%" },
    { label: "Photon loss", value: "low" },
    { label: "Sample rate", value: "1 kHz" },
  ],
};


const ATTACK_LABEL: Record<AttackId, string> = {
  none: "None",
  forgery: "Forgery",
  impersonation: "Impersonation",
  replay: "Replay",
  "intercept-fixed": "Intercept-Resend (Fixed Basis)",
  "intercept-random": "Intercept-Resend (Random Basis)",
  tampering: "Signal Tampering",
  partial: "Partial Attack",
};

const CLASSIFICATION: Record<
  AttackId,
  { honest: boolean; label: string; explanation: string }
> = {
  none: {
    honest: true,
    label: "No anomaly detected",
    explanation:
      "Error statistics stayed inside the expected honest range for every block.",
  },
  forgery: {
    honest: false,
    label: "Forgery attempt detected",
    explanation:
      "The pattern of errors matches an attacker who signed a different message with a mismatched key.",
  },
  impersonation: {
    honest: false,
    label: "Sender impersonation detected",
    explanation:
      "Block statistics indicate the signature was produced by a party holding no valid key material.",
  },
  replay: {
    honest: false,
    label: "Classical replay detected",
    explanation:
      "The signature matched a previously issued one, so freshness checks failed across the block set.",
  },
  "intercept-fixed": {
    honest: false,
    label: "Intercept-resend (fixed basis)",
    explanation:
      "Errors cluster in the blocks where the attacker's fixed measurement basis disagreed with the sender.",
  },
  "intercept-random": {
    honest: false,
    label: "Intercept-resend (random basis)",
    explanation:
      "A scattered, low-density error pattern matches an attacker who measured in a random basis each time.",
  },
  tampering: {
    honest: false,
    label: "Pauli-Z Tampering",
    explanation:
      "The pattern of errors matches an attacker who altered the correction step for this signature.",
  },
  partial: {
    honest: false,
    label: "Partial channel disturbance",
    explanation:
      "Only a contiguous run of blocks shows elevated errors, consistent with partial interference.",
  },
};

const VISUALIZATION: Record<AttackId, AttackResponse["visualization"]> = {
  none: "idle",
  forgery: "swap",
  impersonation: "swap",
  replay: "reuse",
  "intercept-fixed": "grab",
  "intercept-random": "grab",
  tampering: "alter",
  partial: "alter",
};

const EVE_KNOWLEDGE: Record<AttackId, { has: string[]; hasNot: string[] }> = {
  none: {
    has: ["Nothing — no adversary is active this run."],
    hasNot: [
      "The sender's private key",
      "Other verifiers' independent copies",
      "Any interaction with the channel",
    ],
  },
  forgery: {
    has: ["1 copy of transmitted data", "The public signature format"],
    hasNot: [
      "The sender's private key",
      "Other verifiers' independent copies",
      "A valid signature for her chosen message",
    ],
  },
  impersonation: {
    has: ["Public classical bits", "The message text"],
    hasNot: [
      "The sender's private key",
      "The sender's key pool",
      "Any verifier's copy",
    ],
  },
  replay: {
    has: ["1 previously captured signature", "The original message text"],
    hasNot: [
      "A fresh key slot for this run",
      "The sender's private key",
      "The current channel's states",
    ],
  },
  "intercept-fixed": {
    has: ["1 measured copy of transmitted states", "Public classical bits"],
    hasNot: [
      "Correct basis information",
      "The sender's private key",
      "Other verifiers' independent copies",
    ],
  },
  "intercept-random": {
    has: ["Randomly measured copy of some states", "Public classical bits"],
    hasNot: [
      "Basis choices matching the sender",
      "The sender's private key",
      "Other verifiers' independent copies",
    ],
  },
  tampering: {
    has: ["Ability to alter data in transit", "1 copy of transmitted data"],
    hasNot: [
      "The sender's private key",
      "Any verifier's independent copy",
      "The key pool itself",
    ],
  },
  partial: {
    has: [
      "Ability to alter a fraction of transmitted data",
      "1 copy of transmitted data",
    ],
    hasNot: [
      "The sender's private key",
      "The untouched portion of the data",
      "Other verifiers' independent copies",
    ],
  },
};

/* ------------------------------- API -------------------------------- */

export async function init(): Promise<InitResponse> {
  await sleep(220);
  return {
    runId: `run-${Math.random().toString(36).slice(2, 8)}`,
    seed: Math.floor(Math.random() * 1e9),
    hardwareProfile: HARDWARE_PROFILE,
    verifierCountOptions: [1, 2, 3],
    maxVerifiers: 6,
  };
}

export function keygen(): KeygenResponse {
  return {
    totalSlots: TOTAL_SLOTS,
    slotsPerBlock: SLOTS_PER_BLOCK,
    blocks: BLOCKS,
    bagsPerPosition: BAGS_PER_POSITION,
    codewordPositions: CODEWORD_POSITIONS,
  };
}

export function distribute(verifierCount: number): DistributeResponse {
  return {
    verifiers: VERIFIER_NAMES.slice(0, verifierCount).map((name) => ({
      name,
      received: 0,
      total: TOTAL_SLOTS,
      done: false,
    })),
  };
}

export async function channelHealth(
  ctx: RunContext = {},
  opts: { forceFail?: boolean } = {},
): Promise<ChannelHealthResponse> {
  await sleep(1400, ctx);
  const passed = !opts.forceFail;
  const score = passed ? 0.97 : 0.34;
  return {
    score,
    passed,
    bands: { failBelow: 0.5, warnBelow: 0.8 },
    explanation: passed
      ? "Sampled slots matched expected statistics within tolerance."
      : "Sampled slots deviated from expected statistics beyond tolerance.",
  };
}

export async function sign(
  message: string,
  verifierNames: string[],
  ctx: RunContext = {},
): Promise<SignResponse> {
  await sleep(240, ctx);
  const rand = mulberry32(hashString(message));
  const encoded = Array.from({ length: BLOCKS }, () =>
    rand() > 0.5 ? "1" : "0",
  ).join("");
  return {
    signatureId: `SIG-${hashString(message).toString(16).toUpperCase().padStart(8, "0")}`,
    message,
    encoded,
    encodedLength: BLOCKS,
    blocksOpened: BLOCKS,
    sentTo: verifierNames,
  };
}

export async function launchAttack(
  attackId: AttackId,
  intensity: number,
  ctx: RunContext = {},
): Promise<AttackResponse> {
  await sleep(320, ctx);
  return {
    attackId,
    label: ATTACK_LABEL[attackId],
    intensity: attackId === "partial" ? intensity : null,
    visualization: VISUALIZATION[attackId],
    eve: EVE_KNOWLEDGE[attackId],
  };
}

interface PlannedBlock {
  verifier: string;
  block: BlockResult;
}

/** Everything is computed up-front from the seed so a skip can jump to the end. */
export function planVerification(
  verifierNames: string[],
  attackId: AttackId,
  intensity: number,
  seed: number,
): { plan: PlannedBlock[]; results: VerifierResult[] } {
  const plan: PlannedBlock[] = [];
  const results: VerifierResult[] = [];

  for (const [vi, verifier] of verifierNames.entries()) {
    let failed = 0;
    const vrand = mulberry32(seed + vi * 7919);
    const failureRate = failureRateFor(attackId, intensity);

    const blocks: BlockResult[] = Array.from({ length: BLOCKS }, (_, i) => {
      const willFail = vrand() < failureRate;
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
    results.push({
      name: verifier,
      checked: 0,
      total: BLOCKS,
      failed: 0,
      verdict: "pending",
    });
  }

  return { plan, results };
}

function failureRateFor(attackId: AttackId, intensity: number): number {
  switch (attackId) {
    case "none":
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
  }
}

export async function streamVerification(
  plan: PlannedBlock[],
  results: VerifierResult[],
  onEvent: (event: VerifyEvent) => void,
  ctx: RunContext = {},
): Promise<void> {
  for (const entry of plan) {
    await sleep(26, ctx);
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
}

export function agreementFor(results: VerifierResult[]): Agreement {
  const decided = results.filter((r) => r.verdict !== "pending");
  const dissenters = decided
    .filter((r) => r.verdict !== decided[0]?.verdict)
    .map((r) => r.name);
  const verdict =
    decided.length === results.length && results.length > 0
      ? decided[0]!.verdict
      : "pending";
  return { unanimous: dissenters.length === 0, verdict, dissenters };
}

export function buildReport(
  verifierNames: string[],
  results: VerifierResult[],
  attack: AttackResponse,
  channelScore: number,
  seed: number,
  timestamp: string,
): DashboardReport {
  const rand = mulberry32(seed);
  const anyRejected = results.some((r) => r.verdict === "rejected");
  const verdict = anyRejected ? "rejected" : "accepted";
  const classification = CLASSIFICATION[attack.attackId];

  const fingerprint = fingerprintFor(attack.attackId, attack.intensity ?? 50, rand);
  const heatmap = buildHeatmap(attack.attackId, attack.intensity ?? 50, rand);

  return {
    summary: {
      verdict,
      attackLabel: attack.label,
      verifierCount: verifierNames.length,
      timestamp,
      seed,
    },
    classification: {
      ...classification,
      confidence: classification.honest
        ? 0.94
        : Number((0.78 + rand() * 0.2).toFixed(2)),
    },
    fingerprint,
    fingerprintLegend: FINGERPRINT_LEGEND,
    heatmap,
    channelHealth: channelScore,
    analytics: {
      roc: buildRoc(rand),
      rocAxis: { x: "False alarm rate", y: "Detection rate" },
      bars: {
        labels: ["This run", "Expected honest", "Expected attack"],
        values: [
          Number((fingerprint[0].value + fingerprint[1].value + fingerprint[2].value).toFixed(3)),
          0.08,
          0.76,
        ],
      },
    },
    evidenceUrl: `/evidence/${seed}.json`,
  };
}

function fingerprintFor(
  attackId: AttackId,
  intensity: number,
  rand: () => number,
): FingerprintAxis[] {
  const jitter = () => (rand() - 0.5) * 0.08;
  const base: Record<AttackId, [number, number, number]> = {
    none: [0.06, 0.05, 0.07],
    forgery: [0.72, 0.31, 0.28],
    impersonation: [0.66, 0.55, 0.22],
    replay: [0.24, 0.68, 0.35],
    "intercept-fixed": [0.33, 0.74, 0.41],
    "intercept-random": [0.48, 0.44, 0.39],
    tampering: [0.21, 0.27, 0.83],
    partial: [0.58, 0.29, 0.19],
  };
  const scale = attackId === "partial" ? intensity / 100 : 1;
  const [a, b, c] = base[attackId];
  return [
    { key: "a", label: "Errors in Test Type A", value: clamp01(a * scale + jitter()) },
    { key: "b", label: "Errors in Test Type B", value: clamp01(b * scale + jitter()) },
    { key: "c", label: "Errors in Test Type C", value: clamp01(c * scale + jitter()) },
  ];
}

const FINGERPRINT_LEGEND: FingerprintLegendEntry[] = [
  { attackId: "none", label: "No attack", pattern: [0.06, 0.05, 0.07] },
  { attackId: "tampering", label: "Pauli-Z tampering", pattern: [0.21, 0.27, 0.83] },
  { attackId: "intercept-fixed", label: "Intercept (fixed)", pattern: [0.33, 0.74, 0.41] },
  { attackId: "intercept-random", label: "Intercept (random)", pattern: [0.48, 0.44, 0.39] },
  { attackId: "replay", label: "Replay", pattern: [0.24, 0.68, 0.35] },
  { attackId: "forgery", label: "Forgery", pattern: [0.72, 0.31, 0.28] },
  { attackId: "impersonation", label: "Impersonation", pattern: [0.66, 0.55, 0.22] },
  { attackId: "partial", label: "Partial", pattern: [0.58, 0.29, 0.19] },
];

function buildHeatmap(
  attackId: AttackId,
  intensity: number,
  rand: () => number,
): number[] {
  const scale = attackId === "partial" ? intensity / 100 : 1;
  const center = Math.floor(BLOCKS / 2);
  return Array.from({ length: BLOCKS }, (_, i) => {
    if (attackId === "none") return rand() * 0.08;
    if (attackId === "partial") {
      const inBand = i > center - 14 && i < center + 14 ? 1 : 0.12;
      return clamp01((inBand * scale * (0.6 + rand() * 0.4)) as number);
    }
    if (attackId === "tampering") {
      const periodic = i % 7 === 0 ? 1 : 0.35;
      return clamp01(periodic * scale * (0.55 + rand() * 0.45));
    }
    return clamp01(scale * (0.25 + rand() * 0.7));
  });
}

function buildRoc(rand: () => number): AnalyticsPoint[] {
  return Array.from({ length: 14 }, (_, i) => {
    const x = i / 13;
    return {
      x: Number(x.toFixed(3)),
      y: Number(Math.min(1, Math.pow(x, 0.32) + (rand() - 0.5) * 0.05).toFixed(3)),
    };
  });
}

export function buildLogs(
  attack: AttackResponse,
  results: VerifierResult[],
  channelScore: number,
  startedAt: number,
): LogEntry[] {
  const t = (offset: number) =>
    new Date(startedAt + offset).toISOString().replace("T", " ").slice(0, 19);
  const rows: LogEntry[] = [
    { timestamp: t(0), type: "RUN", description: "Simulation initialised" },
    { timestamp: t(1200), type: "KEYGEN", description: "Key pool generated" },
    {
      timestamp: t(2600),
      type: "DISTRIBUTE",
      description: `Keys distributed to ${results.length} verifier(s)`,
    },
    {
      timestamp: t(5200),
      type: "CHANNEL",
      description: `Channel health check scored ${channelScore.toFixed(2)} / 1.00`,
    },
    { timestamp: t(6400), type: "SIGN", description: "Message signed" },
    {
      timestamp: t(7100),
      type: "ATTACK",
      description:
        attack.attackId === "none"
          ? "No attack selected"
          : `Attack scenario launched: ${attack.label}`,
    },
    ...results.map((r, i) => ({
      timestamp: t(8000 + i * 400),
      type: "VERIFY",
      description: `${r.name}: ${r.verdict.toUpperCase()} (${r.failed}/${r.total} blocks failed)`,
    })),
  ];
  return rows;
}

export async function fetchEvidence(report: DashboardReport): Promise<Blob> {
  await sleep(180);
  return new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
}

/* ------------------------------ helpers ------------------------------ */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(3))));
}
