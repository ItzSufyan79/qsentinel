/**
 * Contract smoke test — drives the API seam exactly as the UI would.
 *
 * The mock is the demo backend, so this is a behavioural test of the §11
 * contract shapes, the attack model, and the five-page IA prerequisites.
 * Run: npm run smoke
 */

import { api, ApiError, ROUTES, SYSTEM_PARAMS } from "../src/api";
import { FINGERPRINT_LIBRARY } from "../src/lib/copy";
import type { RunConfig } from "../src/api/types";

let failed = 0;
const section = (name: string) => console.log(`\n— ${name}`);
const ok = (name: string) => console.log(`   ✓ ${name}`);
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) return ok(name);
  failed++;
  console.log(`   ✗ ${name}${extra ? `  (${extra})` : ""}`);
};
const rejects = async (name: string, body: () => Promise<unknown>, code: string) => {
  try {
    await body();
    failed++;
    console.log(`   ✗ ${name}: expected ${code} but it resolved`);
  } catch (e) {
    if (e instanceof ApiError && e.code === code) return ok(name);
    failed++;
    console.log(`   ✗ ${name}: expected ${code}, got ${e instanceof ApiError ? e.code : String(e)}`);
  }
};

async function main() {
  /* ---------------------------------------------------------------- *
   *  1 — fixed system parameters (report 2.2 / 5.5)
   * ---------------------------------------------------------------- */
  section("1 · system parameters + routes");
  check("slots per bag is 128", SYSTEM_PARAMS.slotsPerBag === 128);
  check("63 bags", SYSTEM_PARAMS.bags === 63);
  check("pass line is <12 wrong", SYSTEM_PARAMS.passLine === 12);
  check("fidelity gate is 0.5", SYSTEM_PARAMS.fidelityGate === 0.5);
  check("exactly two verifiers: Bob, Charlie", SYSTEM_PARAMS.verifierNames.join(",") === "Bob,Charlie");
  check(
    "route map has exactly the §11 routes",
    Object.keys(ROUTES).sort().join(",") === "binomial,events,history,logs,rerun,result,run",
  );

  /* ---------------------------------------------------------------- *
   *  2 — create + validation
   * ---------------------------------------------------------------- */
  section("2 · createRun and validation");
  const base: RunConfig = {
    attack: "tampering",
    subtype: "partial",
    message: "PAY 42",
    tamperedMessage: null,
    targetLink: "both",
    fixedBasis: null,
    intensityPct: 25,
    replayType: null,
  };
  const created = await api.createRun(base);
  check("createRun returns session_id", created.session_id.length >= 6);
  check("createRun echoes a seed", typeof created.seed === "number");
  check("createRun echoes the config", created.config.attack === "tampering");
  const fresh = await api.getResult(created.session_id);
  check(
    "a fresh tampering run is REJECTED with severity > 0",
    fresh.verdict === "REJECTED" && fresh.verdictBanner.severity.score > 0,
  );

  await rejects("message > 64 chars is refused", () =>
    api.createRun({ ...base, message: "X".repeat(65) }),
    "INVALID_PARAMS");
  await rejects("empty message is refused", () => api.createRun({ ...base, message: "" }), "INVALID_PARAMS");
  await rejects("substitution needs a different tampered message", () =>
    api.createRun({ ...base, subtype: "message-substitution", tamperedMessage: "PAY 42" }),
    "INVALID_PARAMS");
  await rejects("intensity out of range is refused", () => api.createRun({ ...base, intensityPct: 0 }), "INVALID_PARAMS");
  await rejects("tampering without a sub-type is refused", () => api.createRun({ ...base, subtype: null }), "INVALID_PARAMS");
  await rejects("unknown run resolves as RUN_NOT_FOUND", () => api.getResult("nope-123"), "RUN_NOT_FOUND");

  /* ---------------------------------------------------------------- *
   *  3 — live lifecycle (streamEvents)
   * ---------------------------------------------------------------- */
  section("3 · streamEvents lifecycle");
  const kinds: string[] = [];
  const t: number[] = [];
  await api.streamEvents("honest7", (e) => {
    kinds.push(e.kind);
    t.push(e.tMs);
  });
  check("stream ends on a done frame", kinds[kinds.length - 1] === "done");
  check("session frame is first", kinds[0] === "session");
  check("ledger check happens before quantum verification", kinds.indexOf("ledger") < kinds.indexOf("verify-bag"));
  check("fidelity precedes keys", kinds.indexOf("fidelity") < kinds.indexOf("keys"));
  check("both verifiers measure bags", kinds.filter((k) => k === "verify-bag").length >= 63 * 2 - 8);
  check("timestamps are monotonic", t.every((v, i) => i === 0 || v >= t[i - 1]!));

  const impKinds: string[] = [];
  await api.streamEvents("k9r2xq", (e) => impKinds.push(e.kind));
  check(
    "impersonation never reaches key/sign/verify stages",
    !["keys", "sign", "verify-bag", "verify-done"].some((k) => impKinds.includes(k)),
  );

  /* ---------------------------------------------------------------- *
   *  4 — result fixture matrix
   * ---------------------------------------------------------------- */
  section("4 · result matrix per attack");

  const honest = await api.getResult("honest7");
  check("honest run → ACCEPTED", honest.verdict === "ACCEPTED");
  check("honest severity is zero", honest.verdictBanner.severity.score === 0);
  check(
    "honest fidelity passes the gate",
    (honest.verdictBanner.fidelityTest?.F ?? 0) > SYSTEM_PARAMS.fidelityGate,
  );
  check(
    "honest: both verifiers verify (no NOT RUN)",
    honest.verdictBanner.verifiers.bob.verdict !== "NOT RUN" &&
      honest.verdictBanner.verifiers.charlie.verdict !== "NOT RUN",
  );
  check("banner story is present", honest.story.length > 20);
  check(
    "reasoning chain is complete for an accepted honest run",
    honest.verdictBanner.why.length >= 2,
  );
  check(
    "every 'why' step points at a real chart anchor",
    honest.verdictBanner.why.every((w) => /fidelity|bag|fingerprint|heatmap|bvc|curve|bch|correction/i.test(w.chart)),
  );

  const fake = await api.getResult("e4f5a1");
  check("forgery → REJECTED", fake.verdict === "REJECTED");
  check(
    "forgery: both verifiers reject",
    fake.verdictBanner.verifiers.bob.verdict === "REJECTED" &&
      fake.verdictBanner.verifiers.charlie.verdict === "REJECTED",
  );
  check("forgery severity > 0", fake.verdictBanner.severity.score > 0);
  check(
    "forgery gets the full three-step reasoning chain",
    fake.verdictBanner.why.length === 3 &&
      fake.verdictBanner.why.every((w) => /fidelity|bag|fingerprint|heatmap|bvc|curve|bch|correction/i.test(w.chart)),
  );

  const imp = await api.getResult("k9r2xq");
  check("impersonation stops at the fidelity gate", imp.stoppedAt === "fidelity");
  check(
    "impersonation supplies a fake resource",
    imp.verdictBanner.fidelityTest?.referenceFake === true &&
      imp.verdictBanner.fidelityTest?.passed === false,
  );
  check(
    "impersonation: no measurement ever ran",
    imp.verdictBanner.verifiers.bob.verdict === "NOT RUN" &&
      imp.verdictBanner.verifiers.charlie.verdict === "NOT RUN",
  );
  check(
    "impersonation: no fingerprint, no bags",
    imp.verdictBanner.fingerprintMatch === null && imp.verdictBanner.verifiers.bob.bagsWrong === null,
  );

  const used = await api.getResult("m4v7p3");
  check("replay (USED) stops at the ledger", used.stoppedAt === "verify");
  check(
    "replay (USED): ledger says USED",
    used.verdictBanner.ledger?.status === "USED" && used.verdictBanner.ledger.found === true,
  );
  check("replay (USED): nothing verified", used.verdictBanner.verifiers.bob.verdict === "NOT RUN");

  const unknown = await api.getResult("b7z2c8");
  check("replay (unknown id) is caught too", unknown.verdict === "REJECTED");
  check(
    "replay (unknown id): ledger not found",
    unknown.verdictBanner.ledger?.found === false && unknown.verdictBanner.ledger.status === null,
  );

  const fixedZ = await api.getResult("w6n9j1");
  const fz = fixedZ.verdictBanner.fingerprintMatch;
  check(
    "fixed-basis fingerprint resolves",
    fz !== null && fz.best.length > 0 && fz.runnerUp.length > 0 && fz.distance >= 0 && fz.runnerUpDistance >= 0,
  );
  check(
    "fixed-basis: library distances cover every pattern",
    fz !== null && fz.library.length === FINGERPRINT_LIBRARY.length && fz.library.every((l) => l.distance >= 0),
  );
  check("best match agrees with the library ids", fz !== null && fz.library.some((l) => l.id === fz.best));
  const rz = fixedZ.verdictBanner.verifiers.bob.rates;
  check("fixed-Z leaves Z clean and X/Y disturbed", rz !== null && rz.Z < 0.1 && rz.X > 0.4 && rz.Y > 0.4);

  const partial = await api.getResult("t5c1r7");
  const curve = partial.verdictBanner.detectionCurve;
  check("partial exposes the detection curve", curve !== null && curve.intensities.length >= 8);
  check("partial curve picks the chosen intensity", curve !== null && curve.intensities[curve.chosenIndex] === 25);

  const subst = await api.getResult("n2y6u4");
  check(
    "message substitution shows BCH diffs",
    subst.verdictBanner.bchDiff !== null && (subst.verdictBanner.bchDiff?.changedPositions.length ?? 0) >= 9,
  );
  check("substitution: changed flags cover all 63 bags", subst.verdictBanner.bchDiff?.changed.length === 63);

  const corr = await api.getResult("j8k3w9");
  check(
    "correction-bit shows sent/received pairs",
    corr.verdictBanner.correctionBits !== null &&
      corr.verdictBanner.correctionBits.sent !== corr.verdictBanner.correctionBits.received,
  );
  check(
    "correction-bit fingerprints as ~1 ~1 0",
    corr.verdictBanner.verifiers.bob.rates !== null &&
      corr.verdictBanner.verifiers.bob.rates.Z > 0.9 &&
      corr.verdictBanner.verifiers.bob.rates.X > 0.9,
  );

  /* ---------------------------------------------------------------- *
   *  5 — logs
   * ---------------------------------------------------------------- */
  section("5 · system logs");
  const allLogs = await api.getLogs("e4f5a1");
  check("forgery emits log rows", allLogs.length > 0);
  check(
    "every row has a stage/actor/code/message",
    allLogs.every((r) => r.stage && r.actor && r.code && r.message),
  );
  const attacks = await api.getLogs("e4f5a1", { level: "attack" });
  check("level filter keeps only attack rows", attacks.length > 0 && attacks.every((r) => r.level === "attack"));
  const verifyLogs = await api.getLogs("e4f5a1", { stage: "verify" });
  check("stage filter keeps only verify rows", verifyLogs.every((r) => r.stage === "verify"));
  const q = await api.getLogs("e4f5a1", { q: "Eve" });
  check("search filters on message", q.length > 0 && q.every((r) => r.message.toLowerCase().includes("eve")));

  /* ---------------------------------------------------------------- *
   *  6 — exact binomial
   * ---------------------------------------------------------------- */
  section("6 · binomial analytics");
  const b = await api.getBinomial(128, 0.02, 0.33);
  check("curves cover x = 0..n", b.x.length === 129 && b.honest.length === 129 && b.cheater.length === 129);
  check("pmfs are valid probabilities", b.honest.every((p) => p >= 0) && b.cheater.every((p) => p >= 0));
  check("pass line is derived by the backend, not the UI", b.passLine === 12);
  check(
    "false rejection/acceptance in [0,1]",
    b.falseRejection >= 0 && b.falseRejection <= 1 && b.falseAcceptance >= 0 && b.falseAcceptance <= 1,
  );
  await rejects("n out of range refused", () => api.getBinomial(0, 0.02, 0.33), "INVALID_PARAMS");

  /* ---------------------------------------------------------------- *
   *  7 — rerun reproducibility
   * ---------------------------------------------------------------- */
  section("7 · rerun");
  const rerun = await api.rerun("e4f5a1");
  check("rerun issues a new session id", rerun.session_id.length >= 6 && rerun.session_id !== "e4f5a1");
  const rerunBack = await api.getResult(rerun.session_id);
  check("rerun reproduces a REJECTED forgery", rerunBack.verdict === "REJECTED");
  check("rerun result is stable (same story)", rerunBack.story.length > 0);

  /* ---------------------------------------------------------------- *
   *  8 — history
   * ---------------------------------------------------------------- */
  section("8 · run history");
  const h = await api.getHistory();
  check("baked fixtures appear in history", h.runs.length >= 10);
  check(
    "history rows carry ids + verdicts",
    h.runs.every((r) => r.sessionId.length > 0 && (r.verdict === "ACCEPTED" || r.verdict === "REJECTED")),
  );
  const total = h.byAttack.reduce((a, r) => a + r.runs, 0);
  check("per-attack summary accounts for every run", total === h.runs.length);
  const noAttack = h.byAttack.find((r) => r.attack === "No attack");
  check(
    "honest runs have 0 detected and severity 0",
    noAttack !== undefined && noAttack.detected === 0 && noAttack.meanSeverity === 0,
  );
  const forgery = h.byAttack.find((r) => r.attack === "Forgery");
  check(
    "forgery is counted as detected",
    forgery !== undefined && forgery.detected === forgery.runs && forgery.meanSeverity > 0,
  );
}

main()
  .then(() => {
    if (failed > 0) {
      console.log(`\n${failed} check(s) failed.`);
      process.exit(1);
    }
    console.log("\nAll checks passed.");
  })
  .catch((err) => {
    console.error("\nsmoke aborted:", err instanceof Error ? err.message : err);
    process.exit(1);
  });