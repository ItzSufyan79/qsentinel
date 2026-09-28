/**
 * Headless smoke test for the QSentinel contract.
 *
 * Drives the mock backend through the whole flow — preview, run creation,
 * every live-simulation phase, the streamed verification, the result,
 * arbitration, analytics and the event log — and asserts the shapes the UI
 * depends on. No browser needed.
 */

import { mockApi } from "../src/api/mockApi";
import { ApiError } from "../src/api";
import { ATTACK_OPTIONS } from "../src/api/types";

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

async function main() {
  console.log("\n— attack catalogue —");
  check("nine attack options", ATTACK_OPTIONS.length === 9);
  check("every option has a label", ATTACK_OPTIONS.every((a) => a.label.length > 0));
  check("every option has a description", ATTACK_OPTIONS.every((a) => a.description.length > 0));
  check(
    "collusion is present (arbitration path)",
    ATTACK_OPTIONS.some((a) => a.id === "collusion"),
  );

  console.log("\n— run lifecycle —");
  const preview = await mockApi.preview("forgery", 200, 0.1);
  check("preview returns a confidence", preview.predictedDetectionConfidence > 0);
  check("preview echoes the attack", preview.attackType === "forgery");

  const run = await mockApi.createRun("forgery", 200, 0.1, 1);
  check("createRun returns a run id", run.runId.length > 0);
  check("createRun echoes the seed", run.seed > 0);

  const active = await mockApi.getActive();
  check("getActive reports the run", active.active && active.runId === run.runId);

  console.log("\n— live simulation phases —");
  const keygen = await mockApi.getKeygen(run.runId);
  check("keygen reports blocks", keygen.blocks > 0);
  check("keygen reports slots", keygen.totalSlots > 0);

  const dist = await mockApi.getDistribution(run.runId);
  check("distribution lists verifiers", dist.verifiers.length === 1);
  check("verifier received its keys", dist.verifiers[0].received === dist.verifiers[0].total);

  const signing = await mockApi.getSigning(run.runId);
  check("signing returns an encoded signature", signing.encoded.length === signing.encodedLength);
  check("signing lists recipients", signing.sentTo.length === 1);
  check("signing reports the attack type", signing.attackType === "forgery");
  check("signing flags a non-intercepting attack", signing.intercepts === false);

  const interceptRun = await mockApi.createRun("replay", 200, 0.1, 1);
  const interceptSigning = await mockApi.getSigning(interceptRun.runId);
  check("an intercepting attack is flagged", interceptSigning.intercepts === true);

  const events: string[] = [];
  const results = await mockApi.streamVerification(run.runId, (e) => {
    events.push(e.verifier);
  });
  check("verification streamed events", events.length > 0);
  check("verification resolved results", results.length === 1);
  check("verifier reached a verdict", results[0].verdict !== "pending");

  console.log("\n— outcome —");
  const result = await mockApi.getResult(run.runId);
  check("result has a verdict", result.verdict === "accepted" || result.verdict === "rejected");
  check("result reports a mismatch rate", result.mismatchRate >= 0);
  check("result names a flagged-by check", result.flaggedBy.length > 0);
  check("result lists verifier outcomes", result.verifiers.length === 1);
  check("result explains the root cause", result.rootCause.length > 0);
  check("result states the mitigation", result.mitigation.length > 0);
  check("result carries a severity score", result.severityScore >= 0 && result.severityScore <= 100);

  const arb = await mockApi.getArbitration(run.runId);
  check("arbitration shows two verifiers", arb.verifiers.length === 2);
  check("arbitration has a cross-check status", arb.crossCheckStatus.length > 0);
  check("arbitration has a ruling", arb.arbiterRuling.length > 0);

  console.log("\n— analytics —");
  const summary = await mockApi.getStatsSummary();
  check("summary reports total runs", summary.totalRuns > 0);
  check("summary reports a detection rate", summary.detectionRate > 0);

  const byAttack = await mockApi.getByAttackType();
  check("by-attack-type has rows", byAttack.length === 9);
  check("every row has a detection rate", byAttack.every((r) => r.detectionRate >= 0));

  const hist = await mockApi.getHistogram();
  check("histogram has bins", hist.bins.length > 0);
  check("histogram has honest + attacked series", hist.honest.length === hist.bins.length);

  const forgery = await mockApi.getForgeryComparison();
  check("forgery comparison has both values", forgery.classical > 0 && forgery.quantum >= 0);

  console.log("\n— event log —");
  const log = await mockApi.getLog(1, "all");
  check("log returns entries", log.entries.length > 0);
  check("log entries have a verdict", log.entries.every((e) => e.verdict.length > 0));
  const filtered = await mockApi.getLog(1, "forgery");
  check("log filters by attack type", filtered.entries.every((e) => e.attackType === "forgery"));

  const csv = await mockApi.exportLog("all");
  check("log export returns a blob", csv.size > 0);

  console.log("\n— error normalisation —");
  const codes = [
    "NETWORK",
    "TIMEOUT",
    "ABORTED",
    "RUN_NOT_FOUND",
    "INVALID_STATE",
    "CHANNEL_UNTRUSTED",
    "BACKEND_ERROR",
  ] as const;
  for (const code of codes) {
    const err = new ApiError(code, `test ${code}`);
    check(`ApiError(${code}) carries its code`, err.code === code);
  }
  check("unknown run id throws RUN_NOT_FOUND", await mockApi.getResult("run-nope").then(
    () => false,
    (e) => e instanceof ApiError && e.code === "RUN_NOT_FOUND",
  ));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
