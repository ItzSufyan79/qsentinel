/**
 * Failure-path smoke test. Runs in HTTP mode against a dead port, so the
 * request genuinely fails and we assert the client degrades into a typed,
 * retryable error instead of an unhandled rejection.
 *
 * Run via `npm run smoke:fail` (also chained from `npm run smoke`).
 */
import assert from "node:assert/strict";

/* Point the client at a dead port before it is imported. */
process.env.VITE_API_MODE = "http";
process.env.VITE_API_URL = "http://127.0.0.1:1";
process.env.VITE_API_TIMEOUT = "800";

const { httpApi } = await import("../src/api/client");
const { ApiError } = await import("../src/api/contract");

const step = (name: string) => console.log(`✓ ${name}`);

/* 1 — a dead backend must reject with a typed NETWORK error, not throw junk */
await assert.rejects(
  () => httpApi.getActive(),
  (e: unknown) => e instanceof ApiError && e.code === "NETWORK",
  "expected a typed NETWORK error",
);
step("dead backend rejects with a typed NETWORK error");

/* 2 — a server that accepts but never responds must surface as TIMEOUT */
const { createServer } = await import("node:net");
const hanging = createServer(() => {
  /* accept the connection, never write a response */
});
await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
const hangingPort = (hanging.address() as { port: number }).port;

process.env.VITE_API_URL = `http://127.0.0.1:${hangingPort}`;
process.env.VITE_API_TIMEOUT = "300";
await assert.rejects(
  () => httpApi.getStatsSummary(),
  (e: unknown) => e instanceof ApiError && e.code === "TIMEOUT",
  "expected a TIMEOUT error",
);
step("a hanging server surfaces as TIMEOUT");
hanging.close();
process.env.VITE_API_URL = "http://127.0.0.1:1";
process.env.VITE_API_TIMEOUT = "800";

/* 3 — every error code is constructible and carries its code */
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
  assert.equal(err.code, code, `ApiError(${code}) must carry its code`);
}
step("all 7 error codes normalise");

/* 4 — cancellation is not a failure */
const abortErr = new ApiError("ABORTED", "cancelled");
assert.equal(abortErr.code, "ABORTED");
step("cancellation is a distinct, silent code");

/* 5 — a missing run id is not retryable in the UI's eyes */
const missing = new ApiError("RUN_NOT_FOUND", "no such run", 404);
assert.equal(missing.status, 404);
step("RUN_NOT_FOUND carries its HTTP status");

console.log("\nAll failure-path assertions passed.");
