/**
 * Environment reader shared by the API seam.
 *
 * In the browser the values come from Vite's `import.meta.env`. Under plain Node
 * — which is how `npm run smoke` loads the store — that object does not exist,
 * so we fall back to `process.env`. That fallback is also what lets the
 * failure-path test force HTTP mode against a dead port.
 *
 * Note that every VITE_* key is inlined into the public bundle. Nothing secret
 * belongs in any of them.
 */

const fromVite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
  .env;

const fromNode = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;

export const ENV: Record<string, string | undefined> = { ...fromNode, ...fromVite };

export type ApiMode = "mock" | "http";
