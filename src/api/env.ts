/**
 * Environment reader shared by the API seam.
 *
 * `import.meta.env` is injected by Vite in the browser and is `undefined` under
 * plain Node, which is how `npm run smoke` loads the store. Reading it through
 * one helper keeps that fallback in a single place.
 */

export const ENV: Record<string, string | undefined> =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export type ApiMode = "mock" | "http";
