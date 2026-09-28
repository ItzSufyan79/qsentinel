/**
 * In-browser backend simulator (VITE_API_MODE=mock).
 *
 * This IS the backend seam for the demo: it computes every scientific value
 * exactly as the real backend will (report section 11) and never lets the UI
 * derive one. The pages treat it identically to `client.ts` via the `QdsApi`
 * interface.
 *
 * Everything is deterministic per (config, seed): the session id, the 63×128
 * slot measurements for Bob and Charlie, the observed Z/X/Y rates, the
 * binomial evidence and the severity parts. A handful of sample runs are
 * pre-baked at boot so every route and deep link works offline.
 */

import { ApiError } from "./types";
import type {
  AttackTypeId,
  BinomialResponse,
  CreateRunResponse,
  HistoryResponse,
  LogActor,
  LogLevel,
  LogRow,
  RerunResponse,
  ResultEnvelope,
  ResultResponse,
  RunConfig,
  RunEvent,
  StageId,
  TamperingSubtype,
  TargetLink,
  Verdict,
  VerifierName,
  VerifierReport,
} from "./types";
import { type QdsApi } from "./contract";
import { SYSTEM_PARAMS } from "./contract";
import { DIAGNOSIS, FINGERPRINT_LIBRARY, diagnosisKey } from "../lib/copy";

const { bags: BAGS, slotsPerBag: SLOTS, passLine: PASS_LINE, honestErrorRate: HONEST } =
  SYSTEM_PARAMS;

/* ------------------------------------------------------------------ *
 *  Deterministic RNG
 * ------------------------------------------------------------------ */

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKEN = "0123456789abcdefghjkmnpqrstuvwxyz";

function makeToken(len = 8): string {
  let out = "";
  for (let i = 0; i < len; i++) out += TOKEN[Math.floor(Math.random() * TOKEN.length)];
  return out;
}

/* ------------------------------------------------------------------ *
 *  Exact binomial helpers — report 7.4 "backend computes the exact
 *  binomial"; never a page-level approximation.
 * ------------------------------------------------------------------ */

function pmfArray(n: number, p: number): number[] {
  const out: number[] = [Math.pow(1 - p, n)];
  for (let k = 0; k < n; k++) {
    out.push(out[k] * ((n - k) / (k + 1)) * (p / (1 - p)));
  }
  return out;
}

function tailAtLeast(n: number, p: number, t: number): number {
  if (t <= 0) return 1;
  if (t > n) return 0;
  const pmf = pmfArray(n, p);
  let cdf = 0;
  for (let k = 0; k < t; k++) cdf += pmf[k];
  const tail = 1 - cdf;
  return Math.max(0, Math.min(1, tail));
}

function tailAtMost(n: number, p: number, t: number): number {
  if (t < 0) return 0;
  if (t >= n) return 1;
  const pmf = pmfArray(n, p);
  let cdf = 0;
  for (let k = 0; k <= t; k++) cdf += pmf[k];
  return Math.max(0, Math.min(1, cdf));
}

/** Smallest t with P(X >= t | p_honest) small — the backend's derivation. */
function passLineFor(n: number, pHonest: number): number {
  for (let t = 1; t <= n; t++) {
    if (tailAtLeast(n, pHonest, t) <= 4e-5) return t;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 *  Scenarios — the mismatch model per (attack, affected verifier)
 * ------------------------------------------------------------------ */

const slotBasis = (bag: number, slot: number): number => (bag * SLOTS + slot) % 3;
const BASIS_NAME = ["Z", "X", "Y"] as const;

const honest = (): number => HONEST;

function scenarioFor(config: RunConfig): {
  classification: string;
  caughtBy: string;
  injectedBetween: string;
  category: number;
  measures: boolean;
  affected: VerifierName[];
  /** basis of the "two-high one-clean" patterns */
  fingerprintKey: string;
} {
  const both: VerifierName[] = ["bob", "charlie"];
  const affected = (t: TargetLink | null): VerifierName[] =>
    t === "bob" ? ["bob"] : t === "charlie" ? ["charlie"] : both;

  switch (config.attack) {
    case "no-attack":
      return {
        classification: "No incident — signature accepted by Bob and Charlie",
        caughtBy: "— (all checks passed)",
        injectedBetween: "—",
        category: 0,
        measures: true,
        affected: [],
        fingerprintKey: "honest",
      };
    case "forgery":
      return {
        classification: "Forgery",
        caughtBy: "Bag threshold at Bob and Charlie",
        injectedBetween: "Between signing and verification",
        category: 9,
        measures: true,
        affected: both,
        fingerprintKey: "guess",
      };
    case "impersonation":
      return {
        classification: "Impersonation",
        caughtBy: "Fidelity Test",
        injectedBetween: "Stage 1 (session admission)",
        category: 8,
        measures: false,
        affected: [],
        fingerprintKey: "honest",
      };
    case "replay":
      return {
        classification:
          config.replayType === "unknown"
            ? "Unauthorized session (unknown session ID)"
            : "Replay — session already used",
        caughtBy: "Session ledger lookup",
        injectedBetween: "Stage 5 entry",
        category: config.replayType === "unknown" ? 6 : 5,
        measures: false,
        affected: [],
        fingerprintKey: "honest",
      };
    case "tampering": {
      const sub = config.subtype ?? "random-basis";
      const common = {
        measures: true,
        affected: affected(config.targetLink),
      };
      switch (sub) {
        case "fixed-basis":
          return {
            ...common,
            classification: "Fixed-basis intercept-resend",
            caughtBy: "Bag threshold + fingerprint",
            injectedBetween: "Quantum link, before measurement",
            category: 7,
            fingerprintKey: "fixed",
          };
        case "partial":
          return {
            ...common,
            classification: "Partial / stealth intercept",
            caughtBy: "Bag threshold + heatmap + detection curve",
            injectedBetween: "Quantum link, before measurement",
            category: 6,
            fingerprintKey: "random",
          };
        case "message-substitution":
          return {
            ...common,
            classification: "Message substitution",
            caughtBy: "Bag threshold + BCH-diff heatmap",
            injectedBetween: "Classical channel, after signing",
            category: 8,
            fingerprintKey: "guess",
          };
        case "correction-bit":
          return {
            ...common,
            classification: "Classical correction-bit tampering",
            caughtBy: "Bag threshold + fingerprint",
            injectedBetween: "Classical link during teleportation (stage 3)",
            category: 7,
            fingerprintKey: "correction",
          };
        default:
          return {
            ...common,
            classification: "Random-basis intercept-resend",
            caughtBy: "Bag threshold + fingerprint",
            injectedBetween: "Quantum link, before measurement",
            category: 8,
            fingerprintKey: "random",
          };
      }
    }
  }
}

/** Probability that a measured slot of `verifier` is wrong. */
function mismatchModel(
  config: RunConfig,
  scenario: ReturnType<typeof scenarioFor>,
  changed: Set<number> | null,
  verifier: VerifierName,
): ((basisIdx: number, bag: number) => number) | null {
  if (!scenario.affected.includes(verifier)) {
    return (_b: number) => honest();
  }
  if (config.attack === "no-attack") return (_b: number) => honest();
  if (config.attack === "forgery") return () => 0.5;
  if (config.attack !== "tampering") return null;

  const sub = config.subtype ?? "random-basis";
  if (sub === "fixed-basis") {
    const fixed = BASIS_NAME.indexOf(config.fixedBasis ?? "Z");
    return (b: number) => (b === fixed ? 0.01 : 0.5);
  }
  if (sub === "random-basis") return () => 1 / 3;
  if (sub === "partial") {
    const p = Math.min(1, Math.max(0, (config.intensityPct ?? 25) / 100));
    const blended = p / 3 + (1 - p) * HONEST;
    return () => blended;
  }
  if (sub === "correction-bit") return (b: number) => (b === 2 ? 0.01 : 1);
  if (sub === "message-substitution") {
    const changedSet = changed ?? new Set<number>();
    return (_b: number, bag: number) => (changedSet.has(bag) ? 0.45 : honest());
  }
  return () => 1 / 3;
}

/* ------------------------------------------------------------------ *
 *  Encoding + digest (BCH 39 -> 63 presented as a 63-bit string)
 * ------------------------------------------------------------------ */

function encodeBits(seed: number): string {
  const rng = mulberry32(seed ^ 0x5e3ac1);
  const out: string[] = [];
  for (let i = 0; i < 63; i++) out.push(rng() < 0.5 ? "0" : "1");
  return out.join("");
}

const digestOf = (msg: string): string => hashString(msg).toString(16).padStart(8, "0");

/* ------------------------------------------------------------------ *
 *  Per-verifier slot measurements
 * ------------------------------------------------------------------ */

interface Measurement {
  bagsWrong: number[];
  rates: { Z: number; X: number; Y: number };
  failedBags: number;
  worstBag: { index: number; wrong: number } | null;
}

function measureVerifier(
  seed: number,
  verifier: VerifierName,
  model: (basisIdx: number, bag: number) => number,
): Measurement {
  const rng = mulberry32(seed ^ (verifier === "bob" ? 0xbad : 0xbee));
  const bagsWrong: number[] = new Array(BAGS).fill(0);
  const perBasisWrong = [0, 0, 0];
  const perBasisTotal = [0, 0, 0];

  for (let bag = 0; bag < BAGS; bag++) {
    let wrong = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      const b = slotBasis(bag, slot);
      perBasisTotal[b]++;
      if (rng() < model(b, bag)) {
        wrong++;
        perBasisWrong[b]++;
      }
    }
    bagsWrong[bag] = wrong;
  }

  let worst: { index: number; wrong: number } | null = null;
  let failed = 0;
  bagsWrong.forEach((w, i) => {
    if (w > (worst?.wrong ?? -1)) worst = { index: i, wrong: w };
    if (w >= PASS_LINE) failed++;
  });

  return {
    bagsWrong,
    rates: {
      Z: perBasisWrong[0] / perBasisTotal[0],
      X: perBasisWrong[1] / perBasisTotal[1],
      Y: perBasisWrong[2] / perBasisTotal[2],
    },
    failedBags: failed,
    worstBag: worst,
  };
}

/** changed positions for message substitution — at least 9 */
function changedPositions(seed: number): number[] {
  const rng = mulberry32(seed ^ 0x1c0ffee);
  const k = 9 + Math.floor(rng() * 8);
  const all = Array.from({ length: BAGS }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, k).sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ *
 *  Run construction
 * ------------------------------------------------------------------ */

interface RunRecord {
  sessionId: string;
  config: RunConfig;
  seed: number;
  events: RunEvent[];
  logs: LogRow[];
  result: ResultResponse;
  timestamp: string;
}

const store = new Map<string, RunRecord>();

function measurementsFor(
  config: RunConfig,
  seed: number,
  changed: Set<number> | null,
): Partial<Record<VerifierName, Measurement>> {
  const scenario = scenarioFor(config);
  if (!scenario.measures) return {};
  const out: Partial<Record<VerifierName, Measurement>> = {};
  for (const v of ["bob", "charlie"] as VerifierName[]) {
    const model = mismatchModel(config, scenario, changed, v);
    if (model) out[v] = measureVerifier(seed, v, model);
  }
  return out;
}

function createRecord(sessionId: string, config: RunConfig, seed: number): RunRecord {
  const scenario = scenarioFor(config);
  const changedList = config.subtype === "message-substitution" ? changedPositions(seed) : null;
  const changed = changedList ? new Set(changedList) : null;
  const measurements = measurementsFor(config, seed, changed);
  const bits = encodeBits(seed);
  const digest = digestOf(config.message);
  const fidelity =
    config.attack === "impersonation"
      ? { F: 0.24, gate: 0.5, passed: false, fake: true }
      : { F: 0.96, gate: 0.5, passed: true, fake: false };

  const { events, logs } = buildLifecycle({
    config,
    seed,
    sessionId,
    fidelity,
    measurements,
    changedPositions: changedList ?? [],
    scenario,
    bits,
    digest,
  });
  const result = buildResult({
    config,
    seed,
    sessionId,
    fidelity,
    measurements,
    changedPositions: changedList ?? [],
    scenario,
    message: config.message,
  });

  const record: RunRecord = {
    sessionId,
    config,
    seed,
    events,
    logs,
    result,
    timestamp: new Date().toISOString(),
  };
  store.set(sessionId, record);
  return record;
}

/* ------------------------------------------------------------------ *
 *  Lifecycle builder
 * ------------------------------------------------------------------ */

interface BuildCtx {
  config: RunConfig;
  seed: number;
  sessionId: string;
  fidelity: { F: number; gate: number; passed: boolean; fake: boolean };
  measurements: Partial<Record<VerifierName, Measurement>>;
  changedPositions: number[];
  scenario: ReturnType<typeof scenarioFor>;
  bits: string;
  digest: string;
}

function buildLifecycle(ctx: BuildCtx): { events: RunEvent[]; logs: LogRow[] } {
  const events: RunEvent[] = [];
  const logs: LogRow[] = [];
  let clock = 0;

  const emit = (e: RunEvent) => events.push(e);

  const log = (
    stage: StageId,
    actor: LogActor,
    code: string,
    level: LogLevel,
    message: string,
    payload?: unknown,
  ) => {
    clock += 300;
    const row: LogRow = { timeMs: clock, stage, actor, code, level, message, payload };
    logs.push(row);
    emit({ kind: "log", tMs: clock, stage, actor, code, level, message, payload });
  };

  const { config, scenario, seed, sessionId, fidelity, bits, digest } = ctx;

  clock = 60;
  emit({ kind: "session", tMs: clock, sessionId, seed, message: config.message });
  log("fidelity", "system", "SESSION_CREATED", "info", `Session ${sessionId} requested by Alice (seed ${seed}).`, { sessionId, seed });

  log(
    "fidelity",
    "system",
    fidelity.passed ? "FIDELITY_TEST_PASSED" : "FIDELITY_TEST_FAILED",
    fidelity.passed ? "check" : "attack",
    fidelity.passed
      ? `Fidelity Test passed — F = ${fidelity.F.toFixed(2)} (> ${fidelity.gate}). Entanglement demonstrated.`
      : `Fidelity Test failed — F = ${fidelity.F.toFixed(2)} (\u2264 ${fidelity.gate}): expected entangled resource not demonstrated.`,
    { F: fidelity.F, gate: fidelity.gate, reference_fake: fidelity.fake },
  );
  emit({ kind: "fidelity", tMs: clock, F: fidelity.F, gate: fidelity.gate, passed: fidelity.passed, referenceFake: fidelity.fake });

  if (config.attack === "impersonation") {
    log("fidelity", "eve", "IMPERSONATION_STOPPED", "attack", "Eve cannot demonstrate a genuine entangled resource at session admission. Stages 2–5 never run.", { fake: fidelity.fake });
    emit({ kind: "done", tMs: clock + 600, sessionId });
    return { events, logs };
  }

  log("keys", "alice", "KEYS_GENERATED", "info", `63 bags prepared — 128 slots each (0-bag and 1-bag per encoded position).`, { bags: BAGS, slotsPerBag: SLOTS });
  emit({ kind: "keys", tMs: clock, bits, openedBags: [0, 10, 20, 30, 40, 50, 60] });

  const corr = config.subtype === "correction-bit" ? "01" : null;
  for (const [set, v] of [["a", "bob"], ["b", "charlie"]] as const) {
    clock += 200;
    log("distribute", "alice", "TELEPORT_DONE", "info", `Independent quantum set ${set.toUpperCase()} teleported to ${v === "bob" ? "Bob" : "Charlie"}.`, { set });
    emit({ kind: "distribute", tMs: clock, set, correction: corr ? { sent: corr, received: corr, flipped: false } : null });
  }

  if (config.subtype === "correction-bit") {
    log("distribute", "eve", "ATTACK_INJECTED", "attack", "Eve edits the teleportation correction bits: Bob received 10 instead of 01.", { sent: "01", received: "10" });
    emit({ kind: "inject", tMs: clock, attack: "tampering", subtype: "correction-bit", target: config.targetLink, slotsAttacked: null, slotsTotal: SLOTS, tamperedMessage: null, correctionFlipped: "01\u219210" });
  }

  clock += 220;
  log("sign", "alice", "SIGNATURE_CREATED", "info", `Signature created for "${config.message}" — digest ${digest}, matching bags opened per encoded bit.`, { message: config.message, digest });
  emit({ kind: "sign", tMs: clock, message: config.message, digest, bits });

  // Attack injection moment — between signing and verification (report 3.3)
  const damaged = config.attack === "tampering";
  if (damaged && config.subtype !== "correction-bit") {
    const slots =
      config.subtype === "partial" ? Math.round(((config.intensityPct ?? 25) * SLOTS) / 100) : null;
    log("sign", "eve", "ATTACK_INJECTED", "attack", `Eve acts: ${scenario.classification}${config.targetLink ? ` on the link to ${config.targetLink === "bob" ? "Bob" : config.targetLink === "charlie" ? "Charlie" : "both verifiers"}` : " on the signature path"}.`, { attack: scenario.classification, target: config.targetLink });
    emit({ kind: "inject", tMs: clock, attack: "tampering", subtype: config.subtype, target: config.targetLink, slotsAttacked: slots, slotsTotal: SLOTS, tamperedMessage: config.subtype === "message-substitution" ? config.tamperedMessage : null, correctionFlipped: null });
  }
  if (config.attack === "forgery") {
    log("sign", "eve", "ATTACK_INJECTED", "attack", "Eve replaces Alice's signature with her own packet.", { attack: "forgery" });
    emit({ kind: "inject", tMs: clock, attack: "forgery", subtype: null, target: null, slotsAttacked: null, slotsTotal: SLOTS, tamperedMessage: null, correctionFlipped: null });
  }

  // Replay stops at the session ledger, before quantum measurement
  if (config.attack === "replay") {
    const used = config.replayType === "used";
    const queriedId = "8fK209xq";
    log("sign", "eve", "ATTACK_INJECTED", "attack", used ? "Eve resubmits a genuine old transaction (tag: captured earlier)." : "Eve submits a session ID the ledger has never authorized.", { replayType: used ? "used" : "unknown" });
    clock += 200;
    log(
      "verify",
      "system",
      used ? "LEDGER_LOOKUP_USED" : "LEDGER_LOOKUP_NOT_FOUND",
      "attack",
      used
        ? `Ledger lookup: ${queriedId} is already USED. Replay rejected before any quantum measurement.`
        : `Ledger lookup: ${queriedId} not found. Unauthorized session rejected before any quantum measurement.`,
      { queried_id: queriedId, found: used, status: used ? "USED" : null },
    );
    emit({ kind: "ledger", tMs: clock, queriedId, found: used, status: used ? "USED" : null, stop: true });
    emit({ kind: "done", tMs: clock + 400, sessionId });
    return { events, logs };
  }

  clock += 180;
  log("verify", "system", "LEDGER_LOOKUP_ACTIVE", "check", `Ledger lookup: session ${sessionId} is ACTIVE. Quantum verification proceeds.`, { status: "ACTIVE" });
  emit({ kind: "ledger", tMs: clock, queriedId: sessionId, found: true, status: "ACTIVE", stop: false });

  const verifyOne = (v: VerifierName) => {
    const label = v === "bob" ? "Bob" : "Charlie";
    const code = v === "bob" ? "BOB" : "CHARLIE";
    clock += 200;
    log("verify", v, `${code}_VERIFY_START`, "info", `${label} starts measuring stored qubits against the signature claims.`);
    const meas = ctx.measurements[v];
    if (!meas) return;
    for (let i = 0; i < BAGS; i++) {
      const w = meas.bagsWrong[i];
      clock += 18;
      emit({ kind: "verify-bag", tMs: clock, verifier: v, bagIndex: i, wrong: w, passLine: PASS_LINE, fail: w >= PASS_LINE, checked: i + 1 });
    }
    const ok = meas.failedBags === 0;
    clock += 160;
    log("verify", v, ok ? `${code}_VERIFY_PASSED` : `${code}_VERIFY_FAILED`, ok ? "check" : "attack", `${label} ${ok ? "passed" : "failed"}: ${BAGS - meas.failedBags} of ${BAGS} bags passed (${meas.failedBags} failed, pass line ${PASS_LINE}).`, { failed: meas.failedBags, passLine: PASS_LINE });
    emit({ kind: "verify-done", tMs: clock, verifier: v, passed: BAGS - meas.failedBags, failed: meas.failedBags, verdict: ok ? "ACCEPTED" : "REJECTED", rates: meas.rates });
  };

  verifyOne("bob");
  verifyOne("charlie");

  const ref = ctx.measurements.bob?.rates ?? ctx.measurements.charlie?.rates;
  const fp = ref ? nearestPattern(ref) : null;
  const analysis = (label: string) => {
    clock += 140;
    emit({ kind: "analysis", tMs: clock, step: 0, label });
  };
  log("verify", "system", "FINGERPRINT_MATCHED", "check", fp ? `Observed rates closest to ${fp.label}.` : `No measurement was taken.`);
  analysis("Mismatch counts → error rates per basis");
  log("verify", "system", "CLASSIFIED", "check", `Classification: ${scenario.classification}.`);
  analysis("Fingerprint → classification");
  log("verify", "system", "ROOT_CAUSE_SET", "check", `Root cause: ${DIAGNOSIS[diagnosisKey(config.attack, config.subtype)].cause}.`);
  analysis("Classification → root cause");
  log("verify", "system", "SEVERITY_COMPUTED", "check", "Severity computed from confidence, deviation and category.");
  analysis("Root cause → severity");
  log("verify", "alice", "KEYS_DESTROYED", "info", "One-time quantum material destroyed. Nothing can be re-verified.");
  analysis("Evidence summarized");

  emit({ kind: "done", tMs: clock + 200, sessionId });
  return { events, logs };
}

function fmtRates(r: { Z: number; X: number; Y: number }): string {
  return `(Z ${r.Z.toFixed(2)}, X ${r.X.toFixed(2)}, Y ${r.Y.toFixed(2)})`;
}

/** Nearest library pattern — sorted so fixed-basis and correction-bit match
 *  regardless of which basis happens to be the clean one. */
function nearestPattern(rates: { Z: number; X: number; Y: number }): {
  id: string;
  label: string;
  distance: number;
  runnerUp: { id: string; label: string; distance: number };
  library: { id: string; label: string; distance: number; profile: number[] }[];
} {
  const observed = [rates.Z, rates.X, rates.Y].sort((a, b) => b - a);
  const scored = FINGERPRINT_LIBRARY.map((p) => {
    const profile = [...p.profile].sort((a, b) => b - a);
    return {
      id: p.id,
      label: p.label,
      distance: Math.sqrt(
        (observed[0] - profile[0]) ** 2 +
          (observed[1] - profile[1]) ** 2 +
          (observed[2] - profile[2]) ** 2,
      ),
      /** displayed for the ghost markers — backend-sent, UI never recomputes */
      profile: p.profile,
    };
  }).sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  const runner = scored[1];
  return {
    id: best.id,
    label: best.label,
    distance: best.distance,
    runnerUp: { id: runner.id, label: runner.label, distance: runner.distance },
    library: scored,
  };
}

/* ------------------------------------------------------------------ *
 *  Result assembly
 * ------------------------------------------------------------------ */

interface ResultCtx {
  config: RunConfig;
  seed: number;
  sessionId: string;
  fidelity: { F: number; gate: number; passed: boolean; fake: boolean };
  measurements: Partial<Record<VerifierName, Measurement>>;
  changedPositions: number[];
  scenario: ReturnType<typeof scenarioFor>;
  message: string;
}

function buildResult(ctx: ResultCtx): ResultResponse {
  const { config, scenario, seed, sessionId, fidelity, changedPositions } = ctx;
  const verdict: Verdict = config.attack === "no-attack" ? "ACCEPTED" : "REJECTED";

  const used = config.replayType === "used";
  const ledger =
    config.attack === "replay"
      ? {
          queriedId: "8fK209xq",
          found: used,
          status: used ? ("USED" as const) : null,
          reason: used ? "One-time quantum resource already consumed" : "Session never authorized",
        }
      : null;

  const verifierReport = (v: VerifierName): VerifierReport => {
    const m = ctx.measurements[v];
    if (!m) return { verdict: "NOT RUN", bagsWrong: null, rates: null, passed: 0, failed: 0, worstBag: null };
    const ok = m.failedBags === 0;
    return {
      verdict: ok ? "ACCEPTED" : "REJECTED",
      bagsWrong: m.bagsWrong,
      rates: m.rates,
      passed: BAGS - m.failedBags,
      failed: m.failedBags,
      worstBag: m.worstBag,
    };
  };

  const bob = verifierReport("bob");
  const charlie = verifierReport("charlie");
  const anyRun = bob.verdict !== "NOT RUN" || charlie.verdict !== "NOT RUN";

  const agreement = !anyRun
    ? null
    : bob.verdict === charlie.verdict
      ? {
          consistent: true,
          reason:
            bob.verdict === "ACCEPTED"
              ? "Both accept — consistent, strong agreement."
              : "Both reject with similar fingerprints — likely an attack on the common signing/quantum process.",
        }
      : {
          consistent: false,
          reason:
            "Verifiers disagree. This is itself evidence: possible localized attack, a verifier-link problem, or signature alteration on one path.",
        };

  const ref = ctx.measurements.bob?.rates ?? ctx.measurements.charlie?.rates;
  const fp = ref ? nearestPattern(ref) : null;
  const fingerprintMatch = fp
    ? {
        best: fp.id,
        bestLabel: fp.label,
        distance: fp.distance,
        runnerUp: fp.runnerUp.id,
        runnerUpLabel: fp.runnerUp.label,
        runnerUpDistance: fp.runnerUp.distance,
        library: fp.library,
      }
    : null;
  const confidence = fp
    ? Math.round(Math.max(0, Math.min(1, 1 - fp.distance)) * 100) / 100
    : config.attack === "no-attack"
      ? 0.99
      : 0.9;

  const anyWrong = [
    ...(ctx.measurements.bob?.bagsWrong ?? []),
    ...(ctx.measurements.charlie?.bagsWrong ?? []),
  ];
  const maxWrong = anyWrong.length ? Math.max(...anyWrong) : 0;
  const attacked = !anyRun || config.attack === "no-attack" ? false : bob.verdict === "REJECTED" || charlie.verdict === "REJECTED";
  const confidencePart = attacked ? Math.min(10, Math.round(9 + (confidence - 0.9) * 10)) : 0;
  const deviationPart = attacked ? Math.min(10, Math.round((maxWrong / PASS_LINE) * 10)) : 0;
  const categoryPart = attacked ? scenario.category : 0;
  const score = attacked
    ? Math.max(1, Math.min(10, Math.round(0.4 * confidencePart + 0.3 * deviationPart + 0.3 * categoryPart)))
    : 0;

  const severityEnvelope: ResultEnvelope["severity"] = {
    score,
    confidencePart,
    deviationPart,
    categoryPart,
  };

  const whySteps: ResultEnvelope["why"] = [];
  if (config.attack === "impersonation") {
    whySteps.push({
      label: "Fidelity never passed",
      detail: `Session admission measured F = ${fidelity.F.toFixed(2)}, at or below the gate of ${fidelity.gate}. The entangled resource was not demonstrated; nothing secret was exposed.`,
      chart: "fidelity",
    });
  } else {
    whySteps.push({
      label: "Fidelity Test passed",
      detail: `The link is genuine: F = ${fidelity.F.toFixed(2)} > ${fidelity.gate}. The sender is authenticated.`,
      chart: "fidelity",
    });
    const failures: string[] = [];
    for (const v of ["bob", "charlie"] as VerifierName[]) {
      const m = ctx.measurements[v];
      if (m && m.failedBags > 0) {
        failures.push(
          `${v === "bob" ? "Bob" : "Charlie"} saw ${m.failedBags} of ${BAGS} bags fail (worst bag ${m.worstBag?.wrong ?? 0} wrong vs pass line ${PASS_LINE})`,
        );
      }
    }
    if (failures.length > 0) {
      whySteps.push({
        label: "Mismatches far beyond honest noise",
        detail: `${failures.join("; ")}. Honest noise is calibrated at ${HONEST * 100}% (${HONEST === 0.02 ? "example calibration; real hardware would be measured" : "example calibration"}).`,
        chart: "bag-distribution",
      });
      if (fp) {
        whySteps.push({
          label: "The error pattern matches an attack fingerprint",
          detail: `Observed Z/X/Y rates ${fmtRates(ref as { Z: number; X: number; Y: number })} are closest to "${fp.label}" (distance ${fp.distance.toFixed(3)}); ${fp.runnerUp.label} follows at ${fp.runnerUp.distance.toFixed(3)}.`,
          chart: "fingerprint",
        });
      }
    } else {
      whySteps.push({
        label: "Mismatches stayed at honest-noise levels",
        detail: `Bob and Charlie found no bag above the pass line of ${PASS_LINE}. Nothing to explain.`,
        chart: "bag-distribution",
      });
    }
  }

  const noMeasurement = config.attack === "replay" || config.attack === "impersonation";
  const bagDistribution: ResultEnvelope["bagDistribution"] = noMeasurement
    ? null
    : {
        n: SLOTS,
        passLine: PASS_LINE,
        pHonest: HONEST,
        pCheat: 1 / 3,
        falseRejection: tailAtLeast(SLOTS, HONEST, PASS_LINE),
        falseAcceptance: tailAtMost(SLOTS, 1 / 3, PASS_LINE - 1),
      };

  const detectionCurve: ResultEnvelope["detectionCurve"] =
    config.subtype === "partial"
      ? (() => {
          const intensities: number[] = [];
          const perBag: number[] = [];
          const signature: number[] = [];
          for (let i = 5; i <= 100; i += 5) {
            const p = i / 300 + (1 - i / 100) * HONEST;
            const pb = 1 - tailAtMost(SLOTS, p, PASS_LINE - 1);
            intensities.push(i);
            perBag.push(pb);
            signature.push(1 - Math.pow(1 - pb, BAGS));
          }
          const chosen = Math.min(100, Math.max(5, config.intensityPct ?? 25));
          const idx = intensities.findIndex((x) => x >= chosen);
          const c = idx === -1 ? 0 : idx;
          return {
            intensities,
            perBag,
            signature,
            chosenIndex: c,
            perBagAt: perBag[c],
            signatureAt: signature[c],
          };
        })()
      : null;

  return {
    sessionId,
    seed,
    message: config.message,
    verdict,
    classification: scenario.classification,
    confidence,
    verdictBanner: {
      severity: severityEnvelope,
      fidelityTest: {
        F: fidelity.F,
        gate: fidelity.gate,
        referenceFake: fidelity.fake,
        passed: fidelity.passed,
        failReason:
          config.attack === "impersonation"
            ? "Expected entangled resource not demonstrated; session admission failed. In this simulation, this corresponds to the configured impersonation scenario."
            : null,
      },
      ledger,
      verifiers: { bob, charlie },
      agreement,
      fingerprintMatch,
      why: whySteps,
      attackConfig: {
        attack: config.attack,
        subtype: config.subtype,
        targetLink: config.targetLink,
        basis: config.fixedBasis,
        intensityPct: config.intensityPct,
        slotsAttacked:
          config.subtype === "partial"
            ? Math.round(((config.intensityPct ?? 25) * SLOTS) / 100)
            : null,
        slotsTotal: SLOTS,
        tamperedMessage:
          config.subtype === "message-substitution" ? config.tamperedMessage : null,
        correctionMutation: config.subtype === "correction-bit" ? "01\u219210" : null,
        replayType: config.replayType,
        injectedBetween: scenario.injectedBetween,
        caughtBy: scenario.caughtBy,
      },
      bchDiff:
        config.subtype === "message-substitution"
          ? {
              k: changedPositions.length,
              changedPositions,
              changed: Array.from({ length: BAGS }, (_, i) => changedPositions.includes(i)),
            }
          : null,
      correctionBits:
        config.subtype === "correction-bit"
          ? {
              sent: "01",
              received: "10",
              convention:
                "The two classical bits are inverted for a received slot: bases Z and X rebuild the wrong state, basis Y rebuilds correctly — so two bases run near 1 and one near 0.",
            }
          : null,
      detectionCurve,
      bagDistribution,
    },
    attackPath: { injected: scenario.injectedBetween, caught: scenario.caughtBy },
    story: STORY_LOOKUP[storyKeyOf(config)] ?? "",
    stoppedAt:
      config.attack === "impersonation"
        ? "fidelity"
        : config.attack === "replay"
          ? "verify"
          : null,
    injectedAt: injectedAtOf(config),
  };
}

function injectedAtOf(config: RunConfig): ResultResponse["injectedAt"] {
  if (config.attack === "no-attack") return null;
  if (config.attack === "impersonation") return "fidelity";
  if (config.subtype === "correction-bit") return "distribute";
  if (config.subtype === "message-substitution") return "sign";
  return config.attack === "replay" ? "sign" : "sign";
}

function storyKeyOf(config: RunConfig): string {
  if (config.attack === "replay") return config.replayType === "unknown" ? "replay-unknown" : "replay-used";
  if (config.attack === "tampering") return `tampering-${config.subtype ?? "random-basis"}`;
  if (config.attack === "no-attack") return "no-attack";
  if (config.attack === "forgery") return "forgery";
  return "impersonation";
}

const STORY_LOOKUP: Record<string, string> = {
  "no-attack": "A normal run: Alice signed, Bob and Charlie both verified, and mismatches stayed at honest-noise levels.",
  forgery: "Eve produced a signature without Alice's private quantum information, so the verifiers' measurements disagreed with her claims.",
  impersonation: "Eve tried to start a session as Alice but couldn't demonstrate the entangled resource, so the session was refused before any key or signature existed.",
  "replay-used": "Eve resent a genuine old transaction; the ledger showed it was already used, so it was rejected before any quantum measurement.",
  "replay-unknown": "Eve submitted a session ID the ledger has never authorized, so it was rejected before any quantum measurement.",
  "tampering-fixed-basis": "Eve measured every qubit she intercepted with one basis, disturbing two bases heavily and leaving the third almost clean.",
  "tampering-random-basis": "Eve guessed a basis for each qubit she intercepted, leaving equal disturbance in all three bases.",
  "tampering-partial": "Eve attacked only some slots to stay under the radar, but requiring all 63 bags to pass makes even weak attacks likely to be caught.",
  "tampering-message-substitution": "Eve swapped the message after signing, which changed encoded positions, so several bags failed.",
  "tampering-correction-bit": "Eve edited the teleportation correction bits, so the verifier rebuilt the wrong states and two bases showed near-total mismatch.",
};

/* ------------------------------------------------------------------ *
 *  Sample runs baked at startup so every route and deep link works
 * ------------------------------------------------------------------ */

function bakeSamples(): void {
  const s = (id: string, config: RunConfig) => createRecord(id, config, hashString(id + "|seed"));
  s("honest7", { attack: "no-attack", subtype: null, message: "TRANSFER 1000", tamperedMessage: null, targetLink: null, fixedBasis: null, intensityPct: null, replayType: null });
  s("e4f5a1", { attack: "forgery", subtype: null, message: "PAYROLL JULY", tamperedMessage: null, targetLink: "both", fixedBasis: null, intensityPct: null, replayType: null });
  s("k9r2xq", { attack: "impersonation", subtype: null, message: "GRANT ACCESS", tamperedMessage: null, targetLink: null, fixedBasis: null, intensityPct: null, replayType: null });
  s("m4v7p3", { attack: "replay", subtype: null, message: "OLD PAYMENT", tamperedMessage: null, targetLink: null, fixedBasis: null, intensityPct: null, replayType: "used" });
  s("b7z2c8", { attack: "replay", subtype: null, message: "SPOOFED ID", tamperedMessage: null, targetLink: null, fixedBasis: null, intensityPct: null, replayType: "unknown" });
  s("w6n9j1", { attack: "tampering", subtype: "fixed-basis", message: "SHARE RESULTS", tamperedMessage: null, targetLink: "both", fixedBasis: "Z", intensityPct: null, replayType: null });
  s("q3h8d5", { attack: "tampering", subtype: "random-basis", message: "PUBLISH LEDGER", tamperedMessage: null, targetLink: "bob", fixedBasis: null, intensityPct: null, replayType: null });
  s("t5c1r7", { attack: "tampering", subtype: "partial", message: "SECRET KEY m1", tamperedMessage: null, targetLink: "both", fixedBasis: null, intensityPct: 25, replayType: null });
  s("n2y6u4", { attack: "tampering", subtype: "message-substitution", message: "TRANSFER 500", tamperedMessage: "TRANSFER 5000", targetLink: "both", fixedBasis: null, intensityPct: null, replayType: null });
  s("j8k3w9", { attack: "tampering", subtype: "correction-bit", message: "BONUS RELEASE", tamperedMessage: null, targetLink: "bob", fixedBasis: null, intensityPct: null, replayType: null });
}

bakeSamples();

/* ------------------------------------------------------------------ *
 *  Validation
 * ------------------------------------------------------------------ */

function validateConfig(config: RunConfig): void {
  if (!config.message || config.message.length > 64) {
    throw new ApiError("INVALID_PARAMS", "Message is required and must be \u2264 64 characters", 400);
  }
  if (config.subtype === "message-substitution") {
    if (!config.tamperedMessage) {
      throw new ApiError("INVALID_PARAMS", "Tampered message is required", 400);
    }
    if (config.tamperedMessage === config.message) {
      throw new ApiError("INVALID_PARAMS", "Tampered message must differ from the original", 400);
    }
  }
  if (config.intensityPct !== null && (config.intensityPct < 5 || config.intensityPct > 100)) {
    throw new ApiError("INVALID_PARAMS", "Intensity must be 5\u2013100%", 400);
  }
  if (config.attack === "tampering" && config.subtype === null) {
    throw new ApiError("INVALID_PARAMS", "A tampering sub-type is required", 400);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 *  mockApi — same contract as the HTTP client
 * ------------------------------------------------------------------ */

export const mockApi: QdsApi = {
  async createRun(config): Promise<CreateRunResponse> {
    validateConfig(config);
    const sessionId = makeToken(8);
    const seed = (hashString(sessionId) ^ (Date.now() & 0xffffffff)) >>> 0;
    createRecord(sessionId, config, seed);
    return { session_id: sessionId, seed, config };
  },

  async streamEvents(runId, onEvent, ctx = {}): Promise<void> {
    const record = store.get(runId);
    if (!record) throw new ApiError("RUN_NOT_FOUND", `Run ${runId} not found`, 404);
    const speed = Math.max(1, Math.min(32, ctx.speed?.() ?? 1));
    let prev = 0;
    for (const e of record.events) {
      if (ctx.signal?.aborted) return;
      const delay = Math.max(3, Math.min(45, Math.max(6, (e.tMs - prev) / speed)));
      prev = e.tMs;
      await sleep(delay);
      onEvent(e);
    }
  },

  async getResult(runId): Promise<ResultResponse> {
    const record = store.get(runId);
    if (!record) throw new ApiError("RUN_NOT_FOUND", `Run ${runId} not found`, 404);
    return record.result;
  },

  async getLogs(runId, filters = {}): Promise<LogRow[]> {
    const record = store.get(runId);
    if (!record) throw new ApiError("RUN_NOT_FOUND", `Run ${runId} not found`, 404);
    let rows = record.logs;
    if (filters.stage && filters.stage !== "all") rows = rows.filter((r) => r.stage === filters.stage);
    if (filters.actor && filters.actor !== "all") rows = rows.filter((r) => r.actor === filters.actor);
    if (filters.level && filters.level !== "all") rows = rows.filter((r) => r.level === filters.level);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter(
        (r) => r.message.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
      );
    }
    return rows;
  },

  async getBinomial(n, pHonest, pCheat): Promise<BinomialResponse> {
    if (n < 1 || n > 4096) throw new ApiError("INVALID_PARAMS", "n out of range", 400);
    if (pHonest < 0 || pHonest > 1 || pCheat < 0 || pCheat > 1) {
      throw new ApiError("INVALID_PARAMS", "probability out of range", 400);
    }
    const x = Array.from({ length: n + 1 }, (_, i) => i);
    return {
      n,
      pHonest,
      pCheat,
      passLine: passLineFor(n, pHonest),
      x,
      honest: pmfArray(n, pHonest),
      cheater: pmfArray(n, pCheat),
      falseRejection: tailAtLeast(n, pHonest, passLineFor(n, pHonest)),
      falseAcceptance: tailAtMost(n, pCheat, passLineFor(n, pHonest) - 1),
    };
  },

  async rerun(runId): Promise<RerunResponse> {
    const record = store.get(runId);
    if (!record) throw new ApiError("RUN_NOT_FOUND", `Run ${runId} not found`, 404);
    const sessionId = makeToken(8);
    const seed = (hashString(sessionId) ^ (Date.now() & 0xffffffff)) >>> 0;
    createRecord(sessionId, record.config, seed);
    return { session_id: sessionId, seed };
  },

  async getHistory(): Promise<HistoryResponse> {
    const runs = [...store.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const rows = runs.map((r) => ({
      sessionId: r.sessionId,
      timestamp: r.timestamp,
      attack: attackLabel(r.config),
      subtype: r.config.subtype,
      targetLink: r.config.targetLink,
      verdict: r.result.verdict,
      severity: r.result.verdictBanner.severity.score,
    }));
    const by = new Map<string, { runs: number; detected: number; severity: number }>();
    for (const r of rows) {
      const key = r.attack;
      const cur = by.get(key) ?? { runs: 0, detected: 0, severity: 0 };
      cur.runs++;
      cur.severity += r.severity;
      if (r.verdict === "REJECTED") cur.detected++;
      by.set(key, cur);
    }
    return {
      runs: rows,
      byAttack: [...by.entries()].map(([attack, v]) => ({
        attack,
        runs: v.runs,
        detected: v.detected,
        meanSeverity: v.runs ? v.severity / v.runs : 0,
      })),
    };
  },
};

function attackLabel(config: RunConfig): string {
  const L: Record<AttackTypeId, string> = {
    "no-attack": "No attack",
    forgery: "Forgery",
    impersonation: "Impersonation",
    replay: "Replay",
    tampering: `Tampering (${tamperingLabel(config.subtype)})`,
  };
  return L[config.attack];
}

function tamperingLabel(t: TamperingSubtype | null): string {
  const M: Record<TamperingSubtype, string> = {
    "fixed-basis": "fixed-basis",
    "random-basis": "random-basis",
    partial: "partial",
    "message-substitution": "message substitution",
    "correction-bit": "correction-bit",
  };
  return t ? M[t] : "intercept-resend";
}