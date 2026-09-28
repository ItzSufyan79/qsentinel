/**
 * Headless smoke test for the QSentinel contract.
 *
 * Drives the mock backend through the whole flow — preview, run creation,
 * every live-simulation phase, the streamed verification, the result,
 * arbitration, analytics and the event log — and asserts the shapes the UI
 * depends on. Then it runs each of the nine attack types end to end and checks
 * that the backend's detection story matches the scenario, so a regression in
 * the mock cannot quietly change what a judge sees.
 *
 * No browser needed.
 */

import { mockApi, MOCK_SUPPORTED } from "../src/api/mockApi";
import { ApiError } from "../src/api";
import {
  ATTACK_OPTIONS,
  attackLabel,
  type AttackTypeId,
  type DetectionMechanism,
  type SimulationParameters,
} from "../src/api/types";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

function section(title: string) {
  console.log(`\n— ${title} —`);
}

const params = (
  attackType: AttackTypeId,
  over: Partial<SimulationParameters> = {},
): SimulationParameters => ({
  attackType,
  noise: 0.1,
  qubitsPerSlot: 200,
  verifierCount: 1,
  ...over,
});

/** Runs a scenario all the way to a result, streaming verification as the UI does. */
async function runToResult(p: SimulationParameters) {
  const run = await mockApi.createRun(p);
  await mockApi.getKeygen(run.runId);
  await mockApi.getDistribution(run.runId);
  await mockApi.getSigning(run.runId);
  await mockApi.streamVerification(run.runId, () => {});
  const result = await mockApi.getResult(run.runId);
  return { run, result };
}

async function main() {
  section("attack catalogue");
  check("nine attack options", ATTACK_OPTIONS.length === 9);
  check("every option has a label", ATTACK_OPTIONS.every((a) => a.label.length > 0));
  check("every option has a description", ATTACK_OPTIONS.every((a) => a.description.length > 0));
  check("every option has a verdict icon", ATTACK_OPTIONS.every((a) => a.icon.length > 0));
  check(
    "collusion is present (arbitration path)",
    ATTACK_OPTIONS.some((a) => a.id === "collusion"),
  );
  check(
    "only intensity-based attacks expose a fraction control",
    ATTACK_OPTIONS.filter((a) => a.hasIntensity).every((a) => a.id === "partial"),
  );
  check(
    "collusion requires more than one verifier",
    ATTACK_OPTIONS.find((a) => a.id === "collusion")!.minVerifiers >= 2,
  );
  check(
    "replay and tampering are distinct scenarios",
    ATTACK_OPTIONS.some((a) => a.id === "replay") && ATTACK_OPTIONS.some((a) => a.id === "tampering"),
  );
  check("every option has a label helper", [...ATTACK_OPTIONS].every((a) => attackLabel(a.id) === a.label));

  section("preview");
  const preview = await mockApi.preview(params("forgery"));
  check("preview echoes the attack", preview.attackType === "forgery");
  check("preview returns a threshold", preview.threshold > 0);
  check("preview reports its threshold source", preview.thresholdSource === "derived");
  check("preview returns a confidence", (preview.predictedDetectionConfidence ?? 0) > 0);
  check("preview advertises supported ranges", preview.supported.qubitsPerSlot.max > 0);
  check(
    "preview ranges are the mock's declared ranges",
    preview.supported.qubitsPerSlot.max === MOCK_SUPPORTED.qubitsPerSlot.max,
  );
  const honestPreview = await mockApi.preview(params("honest"));
  check(
    "an honest baseline has no predicted confidence",
    honestPreview.predictedDetectionConfidence === null,
  );
  const overridden = await mockApi.preview(params("forgery", { thresholdOverride: 0.42 }));
  check("an override is echoed back as the threshold", overridden.threshold === 0.42);
  check("an override is labelled as such", overridden.thresholdSource === "override");

  section("run lifecycle");
  const run = await mockApi.createRun(params("forgery"));
  check("createRun returns a run id", run.runId.length > 0);
  check("createRun echoes the seed", run.seed > 0);
  check("createRun echoes the attack", run.attackType === "forgery");
  check("createRun reports a backend threshold", run.threshold > 0);
  check("createRun labels the threshold as derived", run.thresholdSource === "derived");

  const active = await mockApi.getActive();
  check("getActive reports the newest run", active.status === "running" && active.runId === run.runId);
  check("getActive reports a phase", typeof active.phase === "string");

  section("live simulation phases");
  const keygen = await mockApi.getKeygen(run.runId);
  check("keygen reports blocks", keygen.blocks > 0);
  check("keygen reports slots", keygen.totalSlots > 0);
  check("keygen covers every slot exactly once", keygen.slotsPerBlock * keygen.blocks === keygen.totalSlots);

  const dist = await mockApi.getDistribution(run.runId);
  check("distribution lists the configured verifiers", dist.verifiers.length === 1);
  check("verifier received all of its keys", dist.verifiers[0]!.received === dist.verifiers[0]!.total);

  const signing = await mockApi.getSigning(run.runId);
  check("signing returns an encoded signature", signing.encoded.length === signing.encodedLength);
  check("signing lists recipients", signing.sentTo.length === 1);
  check("signing reports the attack type", signing.attackType === "forgery");
  check("forgery does not interpose on the channel", signing.intercepts === false);

  const intercepted = await runToResult(params("intercept-fixed"));
  const interceptSigning = await mockApi.getSigning(intercepted.run.runId);
  check("an intercepting attack is flagged on the channel", interceptSigning.intercepts === true);

  section("streamed verification");
  const events: { verifier: string; mismatches: number; slotCount: number }[] = [];
  const results = await mockApi.streamVerification(run.runId, (e) => {
    events.push({
      verifier: e.verifier,
      mismatches: e.block.mismatches,
      slotCount: e.block.slotCount,
    });
  });
  check("verification streamed at least one event", events.length > 0);
  check("every event carries a measured block", events.every((e) => e.slotCount > 0));
  check("verification resolved results", results.length === 1);
  check("verifier reached a verdict", results[0]!.verdict !== "pending");
  check("verifier checked every block", results[0]!.checked === results[0]!.total);

  section("result shape");
  const result = await mockApi.getResult(run.runId);
  check("result has a verdict", result.verdict === "accepted" || result.verdict === "rejected");
  check("result reports a detection status", ["detected", "not-detected"].includes(result.detectionStatus));
  check("result reports a mismatch rate", result.mismatchRate >= 0);
  check("result threshold matches the run", result.threshold === run.threshold);
  check("result threshold source matches the run", result.thresholdSource === run.thresholdSource);
  check("result names a flagged-by check", result.flaggedBy.length > 0);
  check("result lists verifier outcomes", result.verifiers.length === 1);
  check("result explains the root cause", result.rootCause.length > 0);
  check("result states the mitigation", result.mitigation.length > 0);
  check("result carries a severity score", result.severityScore >= 0 && result.severityScore <= 100);
  check("no detection is claimed for a forgery run", result.detectionStatus === "detected");
  check("a detected run is rejected", result.verdict === "rejected");
  check("arbitration is not offered for an undisputed run", result.arbitrationAvailable === false);

  section("per-scenario detection story");
  const expected: Record<
    AttackTypeId,
    { detected: boolean; mechanism?: DetectionMechanism }
  > = {
    honest: { detected: false, mechanism: "none" },
    forgery: { detected: true, mechanism: "quantum-error-rate" },
    impersonation: { detected: true, mechanism: "quantum-error-rate" },
    replay: { detected: true, mechanism: "nonce-session-validation" },
    "intercept-fixed": { detected: true, mechanism: "quantum-error-rate" },
    "intercept-random": { detected: true, mechanism: "quantum-error-rate" },
    partial: { detected: true, mechanism: "quantum-error-rate" },
    tampering: { detected: true, mechanism: "classical-mac" },
    collusion: { detected: true, mechanism: "verifier-cross-check" },
  };

  for (const option of ATTACK_OPTIONS) {
    const want = expected[option.id];
    const { result: r } = await runToResult(
      params(option.id, {
        verifierCount: Math.max(1, option.minVerifiers),
        ...(option.id === "partial" ? { attackFraction: 0.15 } : {}),
      }),
    );
    check(`${option.id}: detection status as expected`, r.detectionStatus === (want.detected ? "detected" : "not-detected"));
    check(`${option.id}: mechanism is ${want.mechanism}`, r.flaggedBy === want.mechanism);
    check(
      `${option.id}: verdict agrees with the detection status`,
      (r.verdict === "rejected") === (r.detectionStatus === "detected"),
    );
    check(`${option.id}: evidence object present`, typeof r.evidence === "object" && r.evidence !== null);
  }

  section("replay and tampering are distinguished");
  const replayed = await runToResult(params("replay"));
  check("replay is caught by nonce validation", replayed.result.flaggedBy === "nonce-session-validation");
  check("replay evidence names the nonce status", replayed.result.evidence.nonceStatus === "reused");
  check("replay does not claim a MAC failure", replayed.result.evidence.macStatus === undefined);

  const tampered = await runToResult(params("tampering"));
  check("tampering is caught by the MAC", tampered.result.flaggedBy === "classical-mac");
  check("tampering evidence reports a failed MAC", tampered.result.evidence.macStatus === "failed");
  check("tampering evidence names the field", Boolean(tampered.result.evidence.tamperedField));
  check("tampering does not claim a nonce reuse", tampered.result.evidence.nonceStatus === undefined);
  check(
    "no secret key material is exposed",
    !JSON.stringify(tampered.result).toLowerCase().includes("secretkey"),
  );

  section("partial attacks can go undetected");
  const stealth = await runToResult(params("partial", { attackFraction: 0.01 }));
  check("a tiny partial attack slips under the threshold", stealth.result.detectionStatus === "not-detected");
  check("an undetected run is accepted", stealth.result.verdict === "accepted");
  check("no mechanism is claimed", stealth.result.flaggedBy === "none");
  check("the root cause explains the false negative", /threshold/i.test(stealth.result.rootCause));

  section("threshold override is honoured end to end");
  const pinned = await runToResult(params("intercept-random", { thresholdOverride: 0.9 }));
  check("the override reaches the result", pinned.result.threshold === 0.9);
  check("the source is reported as an override", pinned.result.thresholdSource === "override");
  check("a 0.9 threshold cannot be exceeded by the attack", pinned.result.detectionStatus === "not-detected");
  check("the run echoes the override", pinned.run.threshold === 0.9);

  section("collusion and arbitration");
  const colluded = await runToResult(params("collusion", { verifierCount: 2 }));
  check("collusion is caught by the cross-check", colluded.result.flaggedBy === "verifier-cross-check");
  check("collusion offers arbitration", colluded.result.arbitrationAvailable === true);
  check("collusion runs two verifiers", colluded.result.verifiers.length === 2);

  const arb = await mockApi.getArbitration(colluded.run.runId);
  check("arbitration shows both verifiers", arb.verifiers.length === 2);
  check("arbitration reports a mismatch rate per verifier", arb.verifiers.every((v) => v.mismatchRate >= 0));
  check("arbitration has a cross-check status", arb.crossCheckStatus.length > 0);
  check("arbitration has a ruling", arb.arbiterRuling.length > 0);
  check("arbitration timestamps every report", arb.verifiers.every((v) => v.timestamp.length > 0));

  const settled = await mockApi.getActive();
  check("a settled collusion run reports as disputed", settled.status === "disputed");
  const plain = await runToResult(params("forgery"));
  check("a settled ordinary run reports as completed", (await mockApi.getActive()).status === "completed");
  check("getActive points at the newest run", plain.run.runId === (await mockApi.getActive()).runId);

  section("analytics");
  const summary = await mockApi.getStatsSummary();
  check("summary reports total runs", summary.totalRuns > 0);
  check("summary reports a detection rate", summary.detectionRate > 0);
  check("summary reports verifier agreement", (summary.verifierAgreementRate ?? 0) > 0);

  const byAttack = await mockApi.getByAttackType();
  check("by-attack-type has a row per scenario", byAttack.length === ATTACK_OPTIONS.length);
  check("every row has a detection rate", byAttack.every((r) => r.detectionRate >= 0 && r.detectionRate <= 1));
  check("the honest row is never a detection", byAttack.find((r) => r.attackType === "honest")!.detectionRate === 0);
  check(
    "partial is the weakest non-honest scenario",
    byAttack.find((r) => r.attackType === "partial")!.detectionRate <=
      byAttack.find((r) => r.attackType === "tampering")!.detectionRate,
  );

  const hist = await mockApi.getHistogram();
  check("histogram has bins", hist.bins.length > 0);
  check("histogram has an honest series per bin", hist.honest.length === hist.bins.length);
  check("histogram has an attacked series per bin", hist.attacked.length === hist.bins.length);
  check("histogram counts are not negative", [...hist.honest, ...hist.attacked].every((n) => n >= 0));

  const forgery = await mockApi.getForgeryComparison();
  check("forgery comparison has both values", forgery.classical > 0 && forgery.quantum >= 0);
  check("the quantum figure is lower", forgery.quantum < forgery.classical);
  check("both sides are labelled", forgery.classicalLabel.length > 0 && forgery.quantumLabel.length > 0);

  section("event log");
  const log = await mockApi.getLog(1, "all");
  check("log returns entries", log.entries.length > 0);
  check("log paginates", log.totalPages > 1);
  check("log entries have a verdict", log.entries.every((e) => e.verdict.length > 0));
  check("log entries have a date", log.entries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
  check("log entries name a mechanism", log.entries.every((e) => e.flaggedBy.length > 0));

  const attackFiltered = await mockApi.getLog(1, "forgery");
  check("log filters by attack type", attackFiltered.entries.every((e) => e.attackType === "forgery"));
  check("filtering changes the total", attackFiltered.total < log.total);

  const verdictFiltered = await mockApi.getLog(1, "all", { verdict: "rejected" });
  check("log filters by verdict", verdictFiltered.entries.every((e) => e.verdict === "rejected"));

  const searched = await mockApi.getLog(1, "all", { search: "replay" });
  check("log search matches the label", searched.entries.every((e) => e.label.toLowerCase().includes("replay")));

  const dated = await mockApi.getLog(1, "all", { date: log.entries[0]!.date });
  check("log filters by date", dated.entries.every((e) => e.date === log.entries[0]!.date));

  const paged = await mockApi.getLog(2, "all");
  check("page 2 differs from page 1", paged.entries[0]?.runId !== log.entries[0]?.runId);
  check("page 2 reports its own page number", paged.page === 2);

  const overrun = await mockApi.getLog(9999, "all");
  check("an out-of-range page clamps to the last page", overrun.page === overrun.totalPages);

  const csv = await mockApi.exportLog("all");
  check("log export returns a blob", csv.size > 0);
  const csvText = await csv.text();
  check("csv has a header row", csvText.startsWith("timestamp,attack_type"));
  check("csv has one row per entry", csvText.trim().split("\n").length - 1 === log.total);
  const filteredCsv = await mockApi.exportLog("all", { verdict: "rejected" });
  const filteredText = await filteredCsv.text();
  check("csv export honours the same filters", filteredText.trim().split("\n").length - 1 === verdictFiltered.total);

  section("error normalisation");
  const codes = [
    "NETWORK",
    "TIMEOUT",
    "ABORTED",
    "RUN_NOT_FOUND",
    "INVALID_PARAMS",
    "INVALID_STATE",
    "CHANNEL_UNTRUSTED",
    "BACKEND_ERROR",
  ] as const;
  for (const code of codes) {
    const err = new ApiError(code, `test ${code}`);
    check(`ApiError(${code}) carries its code`, err.code === code);
  }
  check(
    "unknown run id throws RUN_NOT_FOUND",
    await mockApi.getResult("run-nope").then(
      () => false,
      (e) => e instanceof ApiError && e.code === "RUN_NOT_FOUND",
    ),
  );
  check(
    "an out-of-range parameter throws INVALID_PARAMS",
    await mockApi
      .preview(params("forgery", { qubitsPerSlot: 99_999 }))
      .then(
        () => false,
        (e) => e instanceof ApiError && e.code === "INVALID_PARAMS",
      ),
  );
  check(
    "a missing attack fraction is rejected",
    await mockApi
      .preview(params("partial"))
      .then(
        () => false,
        (e) => e instanceof ApiError && e.code === "INVALID_PARAMS",
      ),
  );
  check(
    "collusion below two verifiers is rejected",
    await mockApi
      .preview(params("collusion", { verifierCount: 1 }))
      .then(
        () => false,
        (e) => e instanceof ApiError && e.code === "INVALID_PARAMS",
      ),
  );
  check(
    "a threshold override outside 0..1 is rejected",
    await mockApi
      .preview(params("forgery", { thresholdOverride: 1.4 }))
      .then(
        () => false,
        (e) => e instanceof ApiError && e.code === "INVALID_PARAMS",
      ),
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
