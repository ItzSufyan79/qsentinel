/**
 * The single seam between the UI and a backend.
 *
 *   VITE_API_MODE=http  -> talk to the team's server (src/api/client.ts)
 *   VITE_API_MODE=mock  -> local simulation   (default, so the demo always boots)
 *
 * Every consumer imports `api` from here. Nothing else imports `mockApi` or
 * `client` directly, so switching backends is a one-line env change.
 */

import { httpApi } from "./client";
import { ENV, type ApiMode } from "./env";
import type { QdsApi } from "./contract";
import { mockApi } from "./mockApi";

const mode: ApiMode = ENV.VITE_API_MODE === "http" ? "http" : "mock";

export const api: QdsApi = mode === "http" ? httpApi : mockApi;

export const API_MODE = mode;

export { ApiError, ROUTES, type QdsApi, type RunContext } from "./contract";
export * from "./types";
