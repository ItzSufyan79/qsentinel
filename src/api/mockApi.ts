/**
 * Mock backend for the QSentinel contract.
 *
 * ---------------------------------------------------------------------------
 * THIS IS DEMO DATA, NOT A QUANTUM SIMULATION. It exists so the UI can be
 * demonstrated before the team's server is up. It stands in for the server at
 * the same boundary the real backend will occupy: it owns the threshold, the
 * per-slot measurement outcomes, the verdict and the detection mechanism, and
 * the frontend displays whatever it returns.
 *
 * Because the mock is the only thing that can produce numbers here, the
 * simulation below is a slot-level error model — enough to make the per-scenario
 * error signatures visibly different (fixed-basis concentrates on one basis,
 * random-basis spreads across both, a small attack fraction stays under the
 * threshold) without pretending to implement a QDS protocol.
 *
 * Everything is seeded from the run seed, so a run reproduces exactly.
 * ---------------------------------------------------------------------------
 */

import type {
  ActiveResponse,
  ArbitrationResponse,
  AttackEvidence,
  AttackOption,
  AttackTypeId,
  BasisBreakdown,
  BlockResult,
  ByAttackTypeRow,
  DetectionMechanism,
  DetectionStatus,
  DistributionResponse,
  ForgeryComparison,
  HistogramResponse,
  KeygenResponse,
  LogEntry,
  LogPage,
  LogQuery,
  PreviewResponse,
  ResultResponse,
  RunResponse,
  SignResponse,
  SimulationParameters,
  StatsSummary,
  ThresholdSource,
  Verdict,
  VerifierResult,
  VerifierVerdict,
} from "./types";
import { ApiError as ApiErrorClass, ATTACK_OPTIONS, attackLabel } from "./types";
import type { QdsApi, RunContext } from "./contract";
import { VERIFIER_NAMES, mulberry32 } from "../lib/rng";
import { sleep as libSleep } from "../lib/async";

/** The five protocol phases, mirrored from the phase stepper. */
type RunPhase = "keygen" | "distribution" | "signing" | "verification" | "result";

/* ------------------------------------------------------------------ *
 *  Protocol constants — the mock's stand-in for the backend's model
 * ------------------------------------------------------------------ */

const BLOCKS = 63;
const SLOTS_PER_BLOCK = 128;
/** the key pool is split into two bags per codeword position, one per verifier */
const BAGS_PER_POSITION = 2;
const CODEWORD_POSITIONS = 63;
/** every slot a verifier measures across a whole signature */
const TOTAL_SLOTS = BLOCKS * SLOTS_PER_BLOCK;
const MAX_VERIFIERS = VERIFIER_NAMES.length;

/** Backend-declared parameter ranges — the UI reads these, never hardcodes. */
const SUPPORTED = {
  noise: { min: 0, max: 0.12, default: 0.02, step: 0.001 },
  qubitsPerSlot: { min: 100, max: 2000, default: 1000, step: 50 },
  verifierCount: { min: 1, max: 4, default: 2 },
} as const;

function sleep(ms: number, ctx: RunContext = {}): Promise<void> {
  return libSleep(ms, { signal: ctx.signal, speed: ctx.speed });
}

/* ------------------------------------------------------------------ *
 *  Threshold — derived server-side, as the real backend will do
 * ------------------------------------------------------------------ */

/**
 * The mismatch rate an honest run sits at, given the channel noise. Half the
 * noise shows up as a measurement disagreement; the other half is absorbed by
 * the encoding.
 */
function honestFloor(noise: number): number {
  return noise * 0.5;
}

/**
 * The detection threshold sits three sigma above the honest floor for the number
 * of slots being measured, so a run is flagged only when the excess is unlikely
 * to be the channel's own noise. More samples (a bigger signature) means a
 * tighter margin; a noisier channel means a higher floor to clear.
 */
function deriveThreshold(noise: number, qubitsPerSlot: number): number {
  const p = honestFloor(noise);
  const samples = Math.max(1, TOTAL_SLOTS);
  // a larger slot gives a more precise per-slot estimate, so it is allowed a
  // slightly lower absolute margin
  const slack = Math.min(1, 1000 / Math.max(qubitsPerSlot, 1));
  const sigma = Math.sqrt((p * (1 - p)) / samples);
  return round4(clamp(p + 3 * sigma * slack, 0.005, 0.5));
}

/**
 * Per-block tolerance in mismatched slots, three sigma above the floor for one
 * block. A single block has far fewer samples than the whole signature, so its
 * tolerance is proportionally looser — a block can sit inside tolerance while
 * the run as a whole is still over the threshold.
 */
function deriveBlockThreshold(noise: number): number {
  const p = honestFloor(noise);
  const sigma = Math.sqrt((p * (1 - p)) / SLOTS_PER_BLOCK);
  return Math.max(1, Math.round((p + 3 * sigma) * SLOTS_PER_BLOCK));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Number(v.toFixed(4));
const round5 = (v: number) => Number(v.toFixed(5));

/* ------------------------------------------------------------------ *
 *  Per-scenario error model
 * ------------------------------------------------------------------ */

/**
 * Extra probability that a slot comes back wrong, on top of the noise floor.
 * This is what makes each scenario's signature visibly different.
 */
function attackBias(
  attack: AttackTypeId,
  basis: "Z" | "X",
  attackFraction: number,
  colludes: boolean,
): number {
  switch (attack) {
    case "honest":
      return 0;
    // signing-phase attacks: every slot is wrong, both bases alike
    case "forgery":
      return 0.45;
    case "impersonation":
      return 0.4;
    // session replay: the quantum layer is largely intact
    case "replay":
      return 0.02;
    // one fixed basis: the whole error budget lands on the disagreeing basis
    case "intercept-fixed":
      return basis === "X" ? 0.55 : 0.02;
    // random basis each time: the error is spread across both bases
    case "intercept-random":
      return 0.26;
    // partial: only a fraction of qubits, biased toward the X basis
    case "partial":
      return attackFraction * (basis === "X" ? 0.5 : 0.05);
    // classical tampering: a small residue once the bad field is corrected
    case "tampering":
      return 0.05;
    case "collusion":
      return colludes ? 0.32 : 0;
  }
}

/* ------------------------------------------------------------------ *
 *  Run state
 * ------------------------------------------------------------------ */

interface PlannedBlock {
  verifier: string;
  block: BlockResult;
  /** per-basis tallies, so the result endpoint can report a basis breakdown */
  basis: { Z: { errors: number; samples: number }; X: { errors: number; samples: number } };
}

interface MockRun {
  runId: string;
  attack: AttackTypeId;
  noise: number;
  qubitsPerSlot: number;
  verifierCount: number;
  attackFraction: number | null;
  threshold: number;
  thresholdSource: ThresholdSource;
  blockThreshold: number;
  seed: number;
  message: string;
  originalRunId: string | null;
  phase: RunPhase;
  settled: boolean;
  createdAt: number;
  /** computed once per run so the stream and the result cannot disagree */
  plan: PlannedBlock[] | null;
  results: VerifierResult[] | null;
}

const runs = new Map<string, MockRun>();

function makeRunId(): string {
  return `run-${Math.random().toString(36).slice(2, 8)}`;
}

function makeSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A backend-generated message — the user never supplies one. */
function generateMessage(seed: number): string {
  const rand = mulberry32(seed ^ 0x5f3a);
  const amount = 10 + Math.floor(rand() * 90);
  const account = 1000 + Math.floor(rand() * 9000);
  return `Transfer ${amount} QDS units to account ${account}`;
}

function findRun(runId: string): MockRun {
  const run = runs.get(runId);
  if (!run) throw new ApiErrorClass("RUN_NOT_FOUND", `No run ${runId}`, 404);
  return run;
}

/* ------------------------------------------------------------------ *
 *  The slot-level measurement plan
 * ------------------------------------------------------------------ */

/**
 * Plays out every slot once and keeps the outcome, so the live stream and the
 * final result are literally the same run. Verifier 1 of a collusion run
 * behaves honestly while the others are compromised, which is what makes the
 * cross-check diverge.
 */
function ensurePlan(run: MockRun): PlannedBlock[] {
  if (run.plan) return run.plan;

  const plan: PlannedBlock[] = [];
  const names = verifierNames(run);

  names.forEach((verifier, vi) => {
    const colludes = run.attack === "collusion" && vi > 0;
    const rand = mulberry32(run.seed + vi * 7919);
    const blockThreshold = run.blockThreshold;

    for (let i = 0; i < BLOCKS; i += 1) {
      const basis = { Z: { errors: 0, samples: 0 }, X: { errors: 0, samples: 0 } };
      let mismatches = 0;

      for (let j = 0; j < SLOTS_PER_BLOCK; j += 1) {
        const measured: "Z" | "X" = rand() < 0.5 ? "Z" : "X";
        const p = run.noise * 0.5 + attackBias(run.attack, measured, run.attackFraction ?? 0, colludes);
        const wrong = rand() < p;
        basis[measured].samples += 1;
        if (wrong) {
          basis[measured].errors += 1;
          mismatches += 1;
        }
      }

      plan.push({
        verifier,
        block: {
          index: i,
          mismatches,
          threshold: blockThreshold,
          slotCount: SLOTS_PER_BLOCK,
          status: mismatches > blockThreshold ? "fail" : "pass",
        },
        basis,
      });
    }
  });

  run.plan = plan;
  run.results = names.map((name) => ({
    name,
    checked: 0,
    total: BLOCKS,
    failed: 0,
    verdict: "pending" as const,
  }));
  return plan;
}

const verifierNames = (run: MockRun): string[] =>
  VERIFIER_NAMES.slice(0, Math.max(1, Math.min(run.verifierCount, MAX_VERIFIERS)));

/* ------------------------------------------------------------------ *
 *  Detection — the backend's call, never the UI's
 * ------------------------------------------------------------------ */

interface Detection {
  status: DetectionStatus;
  flaggedBy: DetectionMechanism;
  verdict: Verdict;
}

function detect(attack: AttackTypeId, mismatchRate: number, threshold: number): Detection {
  if (attack === "honest") {
    return { status: "not-detected", flaggedBy: "none", verdict: "accepted" };
  }
  // These three are caught by a check other than the quantum error rate, so
  // their outcome does not depend on where the error rate landed.
  if (attack === "replay") {
    return { status: "detected", flaggedBy: "nonce-session-validation", verdict: "rejected" };
  }
  if (attack === "tampering") {
    return { status: "detected", flaggedBy: "classical-mac", verdict: "rejected" };
  }
  if (attack === "collusion") {
    return { status: "detected", flaggedBy: "verifier-cross-check", verdict: "rejected" };
  }
  const detected = mismatchRate > threshold;
  return {
    status: detected ? "detected" : "not-detected",
    flaggedBy: detected ? "quantum-error-rate" : "none",
    verdict: detected ? "rejected" : "accepted",
  };
}

function summarise(plan: PlannedBlock[]) {
  let mismatches = 0;
  let checked = 0;
  const basis = { Z: { errors: 0, samples: 0 }, X: { errors: 0, samples: 0 } };

  for (const entry of plan) {
    mismatches += entry.block.mismatches;
    checked += entry.block.slotCount;
    basis.Z.errors += entry.basis.Z.errors;
    basis.Z.samples += entry.basis.Z.samples;
    basis.X.errors += entry.basis.X.errors;
    basis.X.samples += entry.basis.X.samples;
  }

  const breakdown: BasisBreakdown = {
    zBasisMismatch: basis.Z.samples ? round4(basis.Z.errors / basis.Z.samples) : 0,
    xBasisMismatch: basis.X.samples ? round4(basis.X.errors / basis.X.samples) : 0,
    zBasisSamples: basis.Z.samples,
    xBasisSamples: basis.X.samples,
  };

  return {
    mismatchRate: checked ? round4(mismatches / checked) : 0,
    affectedQubits: mismatches,
    breakdown,
  };
}

/* ------------------------------------------------------------------ *
 *  Per-scenario evidence and narrative
 * ------------------------------------------------------------------ */

function buildEvidence(
  run: MockRun,
  mismatchRate: number,
  breakdown: BasisBreakdown,
  detection: Detection,
): AttackEvidence {
  switch (run.attack) {
    case "honest":
      return {};

    case "forgery":
    case "impersonation":
      return {
        affectedQubits: Math.round(mismatchRate * run.qubitsPerSlot * BLOCKS),
        expectedMismatchRate: round4(run.noise * 0.5),
        notes: [
          run.attack === "forgery"
            ? "The signature covers a different message than the one the verifiers hold."
            : "The signature was produced without the sender's legitimate key half.",
        ],
      };

    case "replay":
      return {
        ...(run.originalRunId ? { originalRunId: run.originalRunId } : {}),
        nonceStatus: "reused",
        expectedMismatchRate: round4(run.noise * 0.5),
        notes: [
          "The quantum error rate alone stayed under the detection threshold — the replay is caught on the classical side.",
          `Nonce for this session was already consumed by run ${run.originalRunId}.`,
        ],
      };

    case "intercept-fixed":
      return {
        basisBreakdown: breakdown,
        expectedMismatchRate: round4(run.noise * 0.5),
        notes: ["The attacker measured every state in a single basis, so the induced error concentrates on that basis."],
      };

    case "intercept-random":
      return {
        basisBreakdown: breakdown,
        expectedMismatchRate: round4(run.noise * 0.5),
        notes: ["The attacker chose a basis per state, so the induced error is spread across both bases."],
      };

    case "partial":
      return {
        attackFraction: run.attackFraction ?? 0,
        basisBreakdown: breakdown,
        expectedMismatchRate: round4(run.noise * 0.5),
        notes: [
          detection.status === "detected"
            ? "The attacked fraction was large enough to push the aggregate error rate over the threshold."
            : "The attacked fraction was small enough that the aggregate error rate stayed under the threshold, so this run was not detected.",
        ],
      };

    case "tampering":
      return {
        macStatus: "failed",
        tamperedField: "declared basis list",
        expectedMismatchRate: round4(run.noise * 0.5),
        notes: [
          "The declared basis list was altered in transit, so the MAC no longer matches the sender's digest.",
          "No secret key material is exposed by this check — only the digest comparison result.",
        ],
      };

    case "collusion": {
      const rates = [...planRates(run).values()];
      return {
        crossCheckStatus: "diverged",
        verifierDivergence: rates.length ? round4(Math.max(...rates) - Math.min(...rates)) : 0,
        notes: [
          "The verifiers reported incompatible verdicts for the same signature, so the run was routed to arbitration.",
        ],
      };
    }
  }
}

/** Per-verifier mismatch rate, used by the collusion evidence and arbitration. */
function planRates(run: MockRun): Map<string, number> {
  const acc = new Map<string, { m: number; n: number }>();
  for (const entry of ensurePlan(run)) {
    const prev = acc.get(entry.verifier) ?? { m: 0, n: 0 };
    prev.m += entry.block.mismatches;
    prev.n += entry.block.slotCount;
    acc.set(entry.verifier, prev);
  }
  const out = new Map<string, number>();
  for (const [name, v] of acc) out.set(name, v.n ? v.m / v.n : 0);
  return out;
}

/**
 * Each verifier's own verdict: its aggregate mismatch against the run's
 * threshold. `failed` stays a count of over-tolerance blocks, which is a
 * different (block-level) measurement and is reported separately.
 */
function verifyVerdicts(run: MockRun): Record<string, VerifierVerdict> {
  const out: Record<string, VerifierVerdict> = {};
  for (const [name, rate] of planRates(run)) {
    out[name] = rate > run.threshold ? "rejected" : "accepted";
  }
  // a verifier that never reported keeps its pending state
  for (const r of run.results ?? []) if (!(r.name in out)) out[r.name] = r.verdict;
  return out;
}

function rootCauseFor(attack: AttackTypeId, detected: boolean, fraction: number | null): string {
  if (attack === "honest") {
    return "No adversary was present. The measured error rate stayed inside the honest baseline, so the signature is consistent with an untampered run.";
  }
  if (attack === "partial" && !detected) {
    return `The attacker touched roughly ${Math.round((fraction ?? 0) * 100)}% of the transmitted qubits. That was not enough to lift the aggregate error rate past the detection threshold, so the signature was accepted.`;
  }
  const map: Record<AttackTypeId, string> = {
    honest: "",
    forgery:
      "The attacker signed a different message using key material that does not match the transmitted signature, so the verifiers' measurements diverge from what the signature claims.",
    impersonation:
      "A party with no legitimate key half claimed to be the signer. Verification used the real verifier-side resources, so the measurements could not be reconciled with the claimed sender.",
    replay:
      "A previously valid transmission was captured and replayed. Session and nonce validation rejected it before the quantum error rate was consulted.",
    "intercept-fixed":
      "The attacker measured every transmitted state in one fixed basis. The induced error concentrates on the blocks where that basis disagreed with the sender's.",
    "intercept-random":
      "The attacker chose a measurement basis at random for each state, spreading the induced error across both bases rather than concentrating it.",
    partial:
      `The attacker altered a fraction of the transmitted qubits (about ${Math.round((fraction ?? 0) * 100)}%), producing a band of elevated error rather than a uniform failure.`,
    tampering:
      "The classical data was modified in transit. The declared basis list no longer matched the sender's digest, so the MAC check failed.",
    collusion:
      "Verifiers reported conflicting verdicts for the same signature, so their independent measurements could not be reconciled without arbitration.",
  };
  return map[attack];
}

function mitigationFor(attack: AttackTypeId, detection: Detection, fraction: number | null): string {
  if (attack === "partial" && detection.status === "not-detected") {
    return `No mitigation triggered. At a ${Math.round((fraction ?? 0) * 100)}% attack fraction the run is a genuine false negative, which is the expected behaviour of a threshold-based detector: sensitivity to partial attacks is a trade against accepting a noisy honest channel.`;
  }
  switch (detection.flaggedBy) {
    case "quantum-error-rate":
      return "The measured error rate exceeded the backend-derived threshold, so the verifiers rejected the signature before it could be accepted.";
    case "classical-mac":
      return "The message authentication code did not match the sender's digest, so the run was rejected on the classical channel.";
    case "nonce-session-validation":
      return "The session nonce had already been consumed by an earlier run, so the replayed transmission was rejected before verification began.";
    case "verifier-cross-check":
      return "The verifiers' reports diverged, so the run was escalated to arbitration and ruled on from the reconciled evidence.";
    case "none":
      return "No mitigation was required. The signature was accepted and the run closed normally.";
  }
}

function severityFor(attack: AttackTypeId, detection: Detection, mismatchRate: number, threshold: number): number {
  if (attack === "honest" || detection.status === "not-detected") return 0;
  const base: Record<AttackTypeId, number> = {
    honest: 0,
    forgery: 88,
    impersonation: 84,
    replay: 62,
    "intercept-fixed": 74,
    "intercept-random": 48,
    partial: 30,
    tampering: 92,
    collusion: 55,
  };
  const margin = threshold > 0 ? (mismatchRate - threshold) / threshold : 0;
  return Math.round(clamp(base[attack] + margin * 20, 0, 100));
}

function confidenceFor(attack: AttackTypeId, detection: Detection): string | null {
  // Only the quantum error-rate check yields a statistic; the other mechanisms
  // are deterministic, so the backend does not report a p-value for them.
  if (detection.flaggedBy !== "quantum-error-rate") return null;
  if (attack === "honest") return null;
  return "Under an honest run this error rate has a 1-in-10^6 or smaller chance of occurring by noise alone.";
}

const FLAGGED_DIFF: Partial<Record<AttackTypeId, { sent: string; received: string }[]>> = {
  forgery: [
    { sent: "message: Transfer 42 QDS units…", received: "message: Transfer 47 QDS units…" },
    { sent: "digest: 9F2C…", received: "digest: 4B71…" },
  ],
  impersonation: [
    { sent: "signer key half: verifier-side reference", received: "signer key half: absent" },
    { sent: "digest: 9F2C…", received: "digest: 71AA…" },
  ],
  "intercept-fixed": [
    { sent: "basis: Z", received: "basis: X (attacker fixed basis)" },
    { sent: "outcome: +1", received: "outcome: -1" },
  ],
  "intercept-random": [
    { sent: "basis: Z / X", received: "basis: chosen per state by the attacker" },
    { sent: "outcome distribution: expected", received: "outcome distribution: flattened" },
  ],
  tampering: [
    { sent: "declared basis list: Z,X,Z,X,…", received: "declared basis list: Z,X,Z,X,… (2 entries swapped)" },
    { sent: "digest: 9F2C…", received: "digest: 9F2C… (unchanged — the field itself was edited)" },
  ],
};

/* ------------------------------------------------------------------ *
 *  Parameter validation
 * ------------------------------------------------------------------ */

function validate(params: SimulationParameters): void {
  const option = attackOption(params.attackType);
  if (params.verifierCount < option.minVerifiers) {
    throw new ApiErrorClass(
      "INVALID_PARAMS",
      `${option.label} requires at least ${option.minVerifiers} verifiers`,
      400,
    );
  }
  if (
    params.noise < SUPPORTED.noise.min ||
    params.noise > SUPPORTED.noise.max ||
    params.qubitsPerSlot < SUPPORTED.qubitsPerSlot.min ||
    params.qubitsPerSlot > SUPPORTED.qubitsPerSlot.max
  ) {
    throw new ApiErrorClass("INVALID_PARAMS", "Parameter out of the supported range", 400);
  }
  if (
    option.hasIntensity &&
    (params.attackFraction === undefined || params.attackFraction <= 0 || params.attackFraction > 1)
  ) {
    throw new ApiErrorClass("INVALID_PARAMS", "Attack fraction is required for this scenario", 400);
  }
  if (
    params.thresholdOverride !== undefined &&
    (params.thresholdOverride <= 0 || params.thresholdOverride >= 1)
  ) {
    throw new ApiErrorClass(
      "INVALID_PARAMS",
      "A threshold override must be a rate between 0 and 1",
      400,
    );
  }
}

/* ------------------------------------------------------------------ *
 *  QdsApi implementation
 * ------------------------------------------------------------------ */

export const mockApi: QdsApi = {
  async getActive(): Promise<ActiveResponse> {
    await sleep(60);
    const run = [...runs.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!run) return { status: "none", runId: null, phase: null };
    if (!run.settled) {
      return { status: "running", runId: run.runId, phase: run.phase };
    }
    return {
      status: run.attack === "collusion" ? "disputed" : "completed",
      runId: run.runId,
      phase: "result",
    };
  },

  async preview(params): Promise<PreviewResponse> {
    await sleep(120);
    validate(params);
    const derived = deriveThreshold(params.noise, params.qubitsPerSlot);
    const threshold = params.thresholdOverride ?? derived;
    const attackFraction = attackOption(params.attackType).hasIntensity
      ? (params.attackFraction ?? 0)
      : null;

    return {
      attackType: params.attackType,
      noise: params.noise,
      qubitsPerSlot: params.qubitsPerSlot,
      verifierCount: params.verifierCount,
      threshold: round4(threshold),
      thresholdSource: params.thresholdOverride === undefined ? "derived" : "override",
      // A preview is a hint, not a guarantee: the partial scenario is
      // explicitly allowed to preview below the threshold.
      predictedDetectionConfidence:
        params.attackType === "honest"
          ? null
          : params.attackType === "partial" &&
              (attackFraction ?? 0) * 0.275 + honestFloor(params.noise) <= threshold
            ? null
            : 0.9,
      supported: {
        noise: { ...SUPPORTED.noise },
        qubitsPerSlot: { ...SUPPORTED.qubitsPerSlot },
        verifierCount: { ...SUPPORTED.verifierCount },
      },
    };
  },

  async createRun(params): Promise<RunResponse> {
    await sleep(320);
    validate(params);

    const option = attackOption(params.attackType);
    const seed = makeSeed();
    const run: MockRun = {
      runId: makeRunId(),
      attack: params.attackType,
      noise: params.noise,
      qubitsPerSlot: params.qubitsPerSlot,
      verifierCount: Math.min(params.verifierCount, MAX_VERIFIERS),
      attackFraction: option.hasIntensity ? (params.attackFraction ?? null) : null,
      threshold:
        params.thresholdOverride ?? deriveThreshold(params.noise, params.qubitsPerSlot),
      thresholdSource: params.thresholdOverride === undefined ? "derived" : "override",
      blockThreshold: deriveBlockThreshold(params.noise),
      seed,
      message: generateMessage(seed),
      originalRunId: `run-${seed.toString(36).slice(-6)}`,
      phase: "keygen",
      settled: false,
      createdAt: Date.now(),
      plan: null,
      results: null,
    };
    runs.set(run.runId, run);

    return {
      runId: run.runId,
      attackType: run.attack,
      noise: run.noise,
      qubitsPerSlot: run.qubitsPerSlot,
      verifierCount: run.verifierCount,
      attackFraction: run.attackFraction,
      threshold: run.threshold,
      thresholdSource: run.thresholdSource,
      seed: run.seed,
    };
  },

  async getKeygen(runId): Promise<KeygenResponse> {
    const run = findRun(runId);
    await sleep(260);
    run.phase = "distribution";
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
    run.phase = "signing";
    return {
      runId,
      verifiers: verifierNames(run).map((name) => ({
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
    run.phase = "verification";
    const rand = mulberry32(run.seed ^ hashString(run.message));
    const encoded = Array.from({ length: BLOCKS }, () => (rand() > 0.5 ? "1" : "0")).join("");
    return {
      runId,
      signatureId: `SIG-${hashString(run.message).toString(16).toUpperCase().padStart(8, "0")}`,
      message: run.message,
      encoded,
      encodedLength: BLOCKS,
      blocksOpened: BLOCKS,
      sentTo: verifierNames(run),
      attackType: run.attack,
      intercepts: attackOption(run.attack).intercepts,
    };
  },

  async streamVerification(runId, onEvent, ctx = {}): Promise<VerifierResult[]> {
    const run = findRun(runId);
    const plan = ensurePlan(run);
    const results = run.results!;

    for (const entry of plan) {
      await sleep(18, ctx);
      const result = results.find((r) => r.name === entry.verifier);
      if (!result) continue;
      if (result.checked >= result.total) {
        // already streamed once — replay the block without double counting
        onEvent({
          verifier: entry.verifier,
          block: { ...entry.block },
          checked: result.checked,
          result: { ...result },
        });
        continue;
      }
      result.checked += 1;
      if (entry.block.status === "fail") result.failed += 1;
      if (result.checked >= result.total) {
        // a verifier's own verdict compares its aggregate against the same
        // threshold the run-level verdict uses, so the two can never disagree
        result.verdict = verifyVerdicts(run)[result.name] ?? "accepted";
      }
      onEvent({
        verifier: entry.verifier,
        block: { ...entry.block },
        checked: result.checked,
        result: { ...result },
      });
    }

    run.phase = "result";
    return results.map((r) => ({ ...r }));
  },

  async getResult(runId): Promise<ResultResponse> {
    const run = findRun(runId);
    await sleep(180);

    const plan = ensurePlan(run);
    const results = run.results!;
    const verdicts = verifyVerdicts(run);
    for (const r of results) {
      // the result endpoint reports the whole signature, so the counters are
      // filled in even when the client skipped the live stream
      r.checked = r.total;
      r.failed = plan.filter((e) => e.verifier === r.name && e.block.status === "fail").length;
      r.verdict = verdicts[r.name] ?? r.verdict;
    }

    const { mismatchRate, breakdown } = summarise(plan);
    const detection = detect(run.attack, mismatchRate, run.threshold);
    run.settled = true;
    run.phase = "result";

    return {
      runId,
      attackType: run.attack,
      detectionStatus: detection.status,
      verdict: detection.verdict,
      mismatchRate,
      threshold: run.threshold,
      thresholdSource: run.thresholdSource,
      confidence: confidenceFor(run.attack, detection),
      flaggedBy: detection.flaggedBy,
      evidence: buildEvidence(run, mismatchRate, breakdown, detection),
      arbitrationAvailable: run.attack === "collusion",
      flaggedDiff: FLAGGED_DIFF[run.attack],
      verifiers: results.map((r) => ({ ...r })),
      rootCause: rootCauseFor(run.attack, detection.status === "detected", run.attackFraction),
      mitigation: mitigationFor(run.attack, detection, run.attackFraction),
      severityScore: severityFor(run.attack, detection, mismatchRate, run.threshold),
    };
  },

  async getArbitration(runId): Promise<ArbitrationResponse> {
    const run = findRun(runId);
    await sleep(200);
    const rates = planRates(run);
    const verifiers = verifierNames(run).map((name, i) => ({
      name,
      mismatchRate: round5(rates.get(name) ?? 0),
      verdict: ((rates.get(name) ?? 0) > run.threshold ? "rejected" : "accepted") as Verdict,
      timestamp: new Date(run.createdAt + 8200 + i * 180).toISOString(),
    }));
    const ratesOnly = verifiers.map((v) => v.mismatchRate);
    const diverged = Math.max(...ratesOnly) - Math.min(...ratesOnly) > run.threshold / 2;

    return {
      runId,
      verifiers,
      crossCheckStatus: diverged ? "diverged" : "matched",
      arbiterRuling: diverged
        ? `${verifiers[verifiers.length - 1]?.name}'s report sits far outside the band the other verifiers report. The cross-check diverged, so the signature is rejected and this run is treated as disputed.`
        : "Every verifier's report falls within the same band, so the cross-check matched and the majority verdict stands.",
    };
  },

  async getStatsSummary(): Promise<StatsSummary> {
    await sleep(160);
    // seeded history plus whatever this session has run, so the dashboard count
    // moves when a run is completed
    const logged = runs.size + buildLog().length;
    return {
      totalRuns: 1284 + logged,
      detectionRate: 0.982,
      avgMismatchHonest: 0.014,
      avgMismatchAttacked: 0.312,
      verifierAgreementRate: 0.947,
    };
  },

  async getByAttackType(): Promise<ByAttackTypeRow[]> {
    await sleep(160);
    return [
      { attackType: "honest", label: attackLabel("honest"), runs: 402, detected: 0, detectionRate: 0 },
      { attackType: "forgery", label: attackLabel("forgery"), runs: 188, detected: 188, detectionRate: 1 },
      { attackType: "impersonation", label: attackLabel("impersonation"), runs: 121, detected: 119, detectionRate: 0.98 },
      { attackType: "replay", label: attackLabel("replay"), runs: 96, detected: 96, detectionRate: 1 },
      { attackType: "intercept-fixed", label: attackLabel("intercept-fixed"), runs: 143, detected: 141, detectionRate: 0.99 },
      { attackType: "intercept-random", label: attackLabel("intercept-random"), runs: 117, detected: 104, detectionRate: 0.89 },
      // partial is deliberately below 1 — a stealth attack can slip under the
      // threshold, and the dashboard has to show that rather than hide it
      { attackType: "partial", label: attackLabel("partial"), runs: 132, detected: 97, detectionRate: 0.73 },
      { attackType: "tampering", label: attackLabel("tampering"), runs: 84, detected: 84, detectionRate: 1 },
      { attackType: "collusion", label: attackLabel("collusion"), runs: 1, detected: 1, detectionRate: 1 },
    ];
  },

  async getHistogram(): Promise<HistogramResponse> {
    await sleep(160);
    return {
      bins: ["0–.05", ".05–.10", ".10–.15", ".15–.20", ".20–.30", ".30+"],
      honest: [402, 0, 0, 0, 0, 0],
      attacked: [31, 48, 66, 92, 148, 118],
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

  async getLog(page, filter, extra): Promise<LogPage> {
    await sleep(140);
    const filtered = queryLog(buildLog(), filter, extra);
    const perPage = 12;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * perPage;
    return {
      entries: filtered.slice(start, start + perPage),
      page: safePage,
      totalPages,
      total: filtered.length,
    };
  },

  async exportLog(filter, extra): Promise<Blob> {
    await sleep(120);
    const rows = queryLog(buildLog(), filter, extra);
    const csv = [
      "timestamp,attack_type,run_id,verdict,flagged_by",
      ...rows.map(
        (e) =>
          `${e.timestamp.replace(" ", "T")},${e.attackType},${e.runId},${e.verdict},${e.flaggedBy}`,
      ),
    ].join("\n");
    return new Blob([csv], { type: "text/csv" });
  },
};

/* ------------------------------------------------------------------ *
 *  Deterministic demo log — same shape as GET /api/log
 * ------------------------------------------------------------------ */

const LOG_PLAN: { attack: AttackTypeId; flaggedBy: DetectionMechanism; detected: boolean }[] = [
  { attack: "honest", flaggedBy: "none", detected: false },
  { attack: "forgery", flaggedBy: "quantum-error-rate", detected: true },
  { attack: "intercept-fixed", flaggedBy: "quantum-error-rate", detected: true },
  { attack: "replay", flaggedBy: "nonce-session-validation", detected: true },
  { attack: "partial", flaggedBy: "none", detected: false },
  { attack: "impersonation", flaggedBy: "quantum-error-rate", detected: true },
  { attack: "partial", flaggedBy: "quantum-error-rate", detected: true },
  { attack: "tampering", flaggedBy: "classical-mac", detected: true },
  { attack: "intercept-random", flaggedBy: "quantum-error-rate", detected: true },
  { attack: "honest", flaggedBy: "none", detected: false },
  { attack: "collusion", flaggedBy: "verifier-cross-check", detected: true },
  { attack: "partial", flaggedBy: "none", detected: false },
];

function buildLog(): LogEntry[] {
  const base = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const pad = (n: number) => String(n).padStart(2, "0");
  // six days of history so pagination and the date filter both have something
  // to do; LOG_PLAN is repeated with a per-pass shift in run id
  const out: LogEntry[] = [];
  for (let i = 0; i < LOG_PLAN.length * 6; i++) {
    const row = LOG_PLAN[i % LOG_PLAN.length]!;
    const pass = Math.floor(i / LOG_PLAN.length);
    const at = new Date(base - i * 1_450_000 - pass * 86_400_000 * 0.5);
    out.push({
      timestamp: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`,
      date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
      attackType: row.attack,
      label: attackLabel(row.attack),
      runId: `run-${((i * 2654435761 + pass * 40503) % 0xffffff).toString(16).padStart(6, "0")}`,
      verdict: row.detected ? "rejected" : "accepted",
      flaggedBy: row.flaggedBy,
      detected: row.detected,
    });
  }
  return out;
}

/** Applies the same refinements the log endpoints accept as query params. */
function queryLog(all: LogEntry[], filter: string, extra?: LogQuery): LogEntry[] {
  const needle = extra?.search?.trim().toLowerCase();
  return all.filter((e) => {
    if (filter !== "all" && e.attackType !== filter) return false;
    if (extra?.verdict && extra.verdict !== "all" && e.verdict !== extra.verdict) return false;
    if (extra?.date && e.date !== extra.date) return false;
    if (needle) {
      const hay = `${e.runId} ${e.label} ${e.flaggedBy}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ *
 *  Exported helpers
 * ------------------------------------------------------------------ */

export function attackOption(id: AttackTypeId): AttackOption {
  return ATTACK_OPTIONS.find((a) => a.id === id) ?? ATTACK_OPTIONS[0]!;
}

export function getRunAttack(runId: string): AttackTypeId {
  return runs.get(runId)?.attack ?? "honest";
}

export function getVerifierNames(count: number): string[] {
  return VERIFIER_NAMES.slice(0, Math.max(1, Math.min(count, MAX_VERIFIERS)));
}

/** Exposed so the smoke test can assert the backend-derived ranges. */
export const MOCK_SUPPORTED = SUPPORTED;
