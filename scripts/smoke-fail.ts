/**
 * Failure-path smoke test. Runs in HTTP mode against a dead port, so the
 * request genuinely fails and we assert the run degrades into a typed,
 * retryable error instead of an unhandled rejection.
 *
 * Run via `npm run smoke:fail` (also chained from `npm run smoke`).
 */
import assert from "node:assert/strict";
import { describeError, isCancellation } from "../src/api/errors";
import { ApiError } from "../src/api/contract";

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

const step = (name: string) => console.log(`✓ ${name}`);

/* 1 — a dead backend must not throw; it must land in the store as an error */
const { useFlow } = await import("../src/state/flowStore");
const store = () => useFlow.getState();

await store().boot();
assert.equal(store().booting, false, "boot did not hang");
assert.equal(store().init, null, "no init response from a dead backend");
assert.ok(store().error, "a failure was recorded instead of thrown");
assert.equal(store().error!.code, "NETWORK", `expected NETWORK, got ${store().error!.code}`);
assert.equal(store().error!.stage, "boot");
assert.equal(store().error!.retryable, true, "a network blip must be retryable");
step("dead backend records a typed NETWORK error rather than throwing");

/* 2 — retry is a no-op once the error has been dismissed */
store().clearError();
assert.equal(store().error, null, "error cleared");
await store().retry();
assert.equal(store().error, null, "retry without a failure does nothing");
step("retry is inert with no recorded failure");

/* 3 — every ApiErrorCode maps to sensible copy and a retry decision */
const CODES = [
  "NETWORK",
  "TIMEOUT",
  "ABORTED",
  "RUN_NOT_FOUND",
  "INVALID_STATE",
  "CHANNEL_UNTRUSTED",
  "BACKEND_ERROR",
] as const;

for (const code of CODES) {
  const described = describeError(new ApiError(code, `${code} occurred`, 500), "verify");
  assert.equal(described.code, code);
  assert.equal(described.stage, "verify");
  assert.equal(described.message, `${code} occurred`);
}
step("all 7 error codes normalise");

/* 4 — cancellation is never reported as a failure */
const abort = new DOMException("Aborted", "AbortError");
assert.equal(isCancellation(abort), true, "DOMException AbortError is a cancellation");
assert.equal(isCancellation(new ApiError("ABORTED", "cancelled")), true);
assert.equal(isCancellation(new ApiError("TIMEOUT", "too slow")), false);
step("Skip/Restart cancellations stay silent");

/* 5 — non-ApiError junk still produces a usable message */
const junk = describeError(new TypeError("x.y is not a function"), "evidence");
assert.equal(junk.code, "BACKEND_ERROR");
assert.equal(junk.message, "x.y is not a function");
assert.equal(junk.retryable, true);
step("unknown throwables degrade to BACKEND_ERROR");

/* 6 — a run-not-found must NOT offer a pointless retry */
assert.equal(describeError(new ApiError("RUN_NOT_FOUND", "gone", 404), "boot").retryable, false);
assert.equal(describeError(new ApiError("INVALID_STATE", "nope", 409), "verify").retryable, false);
step("non-retryable codes are flagged as such");

console.log("\nAll failure-path assertions passed.");
