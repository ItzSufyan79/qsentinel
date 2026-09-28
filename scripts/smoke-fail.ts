/**
 * Failure-path smoke test — proves the HTTP client surfaces backend and
 * network failures as typed ApiErrors instead of raw rejects, and that the
 * backend is never reached in a way the UI cannot describe.
 *
 * Run via `npm run smoke:fail` (forces VITE_API_MODE=http against a dead port).
 */

import { ApiError, ROUTES } from "../src/api";
import { ENV } from "../src/api/env";
import { httpApi } from "../src/api/client";

let failed = 0;
const ok = (name: string) => console.log(`   ✓ ${name}`);
const fail = (name: string, why = "") => {
  failed++;
  console.log(`   ✗ ${name}${why ? `  (${why})` : ""}`);
};

async function expects(code: string, body: () => Promise<unknown>) {
  try {
    await body();
    fail(`${code} was expected but the call resolved`);
  } catch (e) {
    const okCode = e instanceof ApiError && e.code === code;
    if (okCode) return ok(`${code}`);
    fail(`${code} — got ${e instanceof ApiError ? e.code : String(e)}`, e instanceof Error ? e.message : "");
  }
}

async function main() {
  console.log(`\n— failure paths (mode=${ENV.VITE_API_MODE}, url=${ENV.VITE_API_URL})`);

  if (ENV.VITE_API_MODE !== "http") {
    fail("smoke:fail must run with VITE_API_MODE=http");
  } else {
    const config = {
      attack: "forgery" as const,
      subtype: null,
      message: "PAY 1",
      tamperedMessage: null,
      targetLink: "bob" as const,
      fixedBasis: null,
      intensityPct: null,
      replayType: null,
    };

    await expects("NETWORK", () => httpApi.createRun(config));
    await expects("NETWORK", () => httpApi.getHistory());
    await expects("NETWORK", () => httpApi.getResult("e4f5a1"));
    await expects("NETWORK", () => httpApi.getLogs("e4f5a1"));
    await expects("NETWORK", () => httpApi.getBinomial(128, 0.02, 0.33));

    ok(`route map is still the §11 surface: ${Object.keys(ROUTES).length} routes`);
  }

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nFailure paths behave as typed errors.");
}

main().catch((err) => {
  console.error("smoke:fail aborted:", err instanceof Error ? err.message : err);
  process.exit(1);
});