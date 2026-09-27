/**
 * Headless smoke test for the QSentinel flow state machine.
 * Run: npm run smoke
 *
 * Stubs the handful of browser globals the store touches, then drives the
 * five-page sequence the same way a user would and asserts each transition.
 */
import assert from "node:assert/strict";

const root = globalThis as unknown as {
  document: { documentElement: Record<string, unknown> };
  window: Record<string, unknown>;
};

root.document = {
  documentElement: {
    style: {
      setProperty() {},
      getPropertyValue() {
        return "1";
      },
    },
    classList: { toggle() {}, add() {}, remove() {} },
  },
} as never;

root.window = {
  scrollTo() {},
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
} as never;

const { useFlow } = await import("../src/state/flowStore");

const store = () => useFlow.getState();
const step = (name: string) => console.log(`✓ ${name}`);

/* 1 — boot + configuration */
await store().boot();
assert.ok(store().init, "init response received");
assert.equal(store().booting, false, "boot completes");
assert.equal(store().page, 1, "starts on page 1");
store().setVerifierCount(2);
step("boot + verifier count");

/* 2 — key generation */
await store().startSimulation();
assert.equal(store().section, "keygen");
assert.ok(store().keygen?.done, "key generation completes");
assert.equal(
  store().keygen?.total,
  store().keygenMeta?.totalSlots,
  "slots come from the backend response",
);
step("key generation");

/* 3 — distribution */
await store().toDistribute();
assert.equal(store().section, "distribute");
assert.ok(store().distributionDone, "distribution completes");
assert.equal(store().distribution.length, 2, "one target per verifier");
assert.ok(
  store().distribution.every((v) => v.received === v.total),
  "every verifier reaches 100%",
);
step("distribution to 2 verifiers");

/* 4 — channel health */
await store().toHealth();
assert.ok(store().health, "health response received");
assert.equal(store().health?.passed, true, "channel passes by default");
assert.equal(store().maxPage, 2, "page 2 unlocked after a pass");
step(`channel health (${store().health?.score})`);

/* 5 — sign */
store().goToPage(2);
assert.equal(store().page, 2, "navigates to page 2");
store().setMessage("hello qsentinel");
await store().signMessage();
assert.ok(store().signature, "signature returned");
assert.equal(store().signature?.encodedLength, 63, "63-bit encoding");
assert.deepEqual(store().signature?.sentTo, ["Bob", "Charlie"], "sent to both verifiers");
assert.equal(store().maxPage, 3, "page 3 unlocked");
step("sign a message");

/* 6 — attack */
store().goToPage(3);
store().selectAttack("tampering");
await store().launchAttack();
assert.equal(store().attack?.attackId, "tampering");
assert.ok(store().attack?.eve.hasNot.length, "Eve's restricted-access list present");
assert.equal(store().maxPage, 4, "page 4 unlocked");
step("launch attack scenario");

/* 7 — verification */
await store().startVerify();
assert.equal(store().verifyStage, "done", "verification finishes");
assert.equal(store().verifierResults.length, 2);
assert.equal(store().verifierResults[0]?.total, 63, "63 blocks per verifier");
assert.ok(store().agreement, "cross-verifier agreement computed");
assert.equal(store().blockResults.Bob?.length, 63, "block grid fully populated");
assert.ok(
  store().verifierResults.every((r) => r.verdict === "rejected"),
  "tampering is rejected",
);
step("streaming verification");

/* 8 — dashboard */
store().goToPage(5);
assert.equal(store().page, 5, "dashboard reachable");
assert.ok(store().report, "report built");
assert.equal(store().report?.summary.attackLabel, "Signal Tampering");
assert.equal(store().report?.fingerprint.length, 3, "three fingerprint axes");
assert.equal(store().report?.heatmap.length, 63, "63 heatmap cells");
assert.ok(store().logs.length > 0, "event log populated");
step("dashboard + report");

/* 11 — security summary: the PS requires forgery probability analysis */
const security = store().report?.security;
assert.ok(security, "report carries a security summary");
assert.equal(security!.honestAcceptanceProbability, 1, "honest acceptance is exactly 1");
assert.equal(security!.falsePositives, 0, "no false positives");
assert.ok(security!.trials > 0, "trials recorded");
assert.ok(security!.claimedForgeryBound.length > 0, "a bound is claimed");

const curve = store().report?.forgeryCurve;
assert.ok(curve && curve.points.length > 1, "forgery curve has multiple points");
const probabilities = curve!.points.map((p) => p.probability);
assert.ok(
  probabilities.every((p, i) => i === 0 || p <= probabilities[i - 1]),
  "forgery probability never increases with block count",
);
assert.ok(Math.min(...probabilities) < 1e-6, "probability decays below 1e-6 by the final block");
step("security summary and forgery curve are reported");

/* 9 — protocol page: three optional endpoints, all degraded gracefully */
store().goToPage(5);
assert.equal(store().page, 5, "report page reachable once verification finished");
assert.equal(store().maxPage, 5, "maxPage advances to the report");

await store().loadProtocol();
const proto = store().protocol;
assert.equal(store().protocolStage, "done", "protocol load completed");
assert.equal(store().maxPage, 6, "protocol page unlocks the last step");
assert.ok(proto.bell, "bell state provided");
assert.equal(proto.bell!.amplitudes.length, 4, "bell state has four basis amplitudes");
assert.ok(
  Math.abs(proto.bell!.amplitudes.reduce((sum, a) => sum + a.probability, 0) - 1) < 0.01,
  "amplitudes sum to ~1",
);
assert.ok(proto.teleport, "teleport trace provided");
assert.ok(proto.teleport!.steps.length >= 5, "teleport trace has the full step sequence");
assert.ok(
  proto.teleport!.steps.some((s) => s.correction !== "I"),
  "a non-identity Pauli correction is shown",
);
assert.ok(proto.measurements.length >= 2, "measurement series provided");
assert.ok(
  proto.measurements.every((m) => m.bins.length === m.expected.length),
  "every measurement bin has an expected count",
);
assert.ok(
  new Set(proto.measurements.map((m) => m.basis)).size >= 2,
  "measurement series cover more than one basis",
);
assert.ok(
  proto.measurements.every((m) => m.verdict === "match" || m.verdict === "deviant"),
  "every measurement series carries a verdict",
);
assert.equal(proto.provided.bell && proto.provided.teleport && proto.provided.measurements, true);
step("protocol primitives load from the optional endpoints");



/* 10 — locked navigation is enforced */
store().restart();
assert.equal(store().page, 1, "restart returns to page 1");
store().goToPage(4);
assert.equal(store().page, 1, "cannot skip ahead after restart");
step("navigation locking");

/* 11 — failed channel blocks the flow */
store().setForceChannelFail(true);
await store().startSimulation();
await store().toDistribute();
await store().toHealth();
assert.equal(store().health?.passed, false, "channel fails when forced");
assert.equal(store().maxPage, 1, "page 2 stays locked on a failed channel");
assert.equal(store().page, 1, "user cannot advance past a failed channel");
step("failed channel halts the flow");

console.log("\nAll flow assertions passed.");
console.log("\nAll flow assertions passed.");
