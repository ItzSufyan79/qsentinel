# QSentinel

Quantum-inspired cyber threat detection for digital signatures — **SIH PS 26141**
(Blockchain & Cybersecurity), by Egreen Quanta.

A software framework that simulates quantum public-key distribution using
Bell-state entanglement and quantum teleportation, applies Pauli correction and
projective measurements for signature verification, and detects malicious
activity through statistical evaluation and threshold-based decision rules.

Detection never uses AI or machine learning: it measures, compares the
distribution against the expected one, applies a threshold, and decides.

## Layout

One repository, two deployables:

| Path | What | Deployed to |
| --- | --- | --- |
| `/` | React + TypeScript frontend | Vercel — `qsentinel.vercel.app` |
| `/backend` | FastAPI engine + contract routes | Render — `qsentinel-api.onrender.com` |

`render.yaml` at the repo root drives Render via a Blueprint (`rootDir: backend`).
The backend has its own state notes under `backend/BACKEND_STATE.md`; connect it
with `DATABASE_URL` and `CORS_ORIGINS` as documented in `backend/.env.example`.

## Pages

Six routes, each a real URL that can be opened, reloaded, or linked to directly.
Attack runs are reproducible end to end from the run's `seed`.

| Route | Page | Data |
| --- | --- | --- |
| `/` | Overview | static (claims + the three headline numbers) |
| `/simulate` | New Simulation | `POST /api/runs`, `POST /api/runs/{id}/rerun` |
| `/run/:runId` | Live Simulation | `GET /api/runs/{id}/events` (SSE stream) |
| `/results/:runId` | Results | `GET /api/runs/{id}/result`, `GET .../logs`, `GET /api/analysis/binomial` |
| `/history` | Run History | `GET /api/history` |

Legacy paths from the earlier concept (`/dashboard`, `/log`, `/simulate/run/:id`,
`arbitration`) redirect to their modern equivalents; unknown run IDs show the
report's "Session not found" card.

The Results page is a verdict banner (classification, confidence, severity
gauge, story), a three-step reasoning chain, the attack path, per-verifier
outcomes (Bob / Charlie), the 63-bag heatmap with pass line, fingerprints,
and — per attack — the session-ledger, BCH-diff, correction-bit, or detection
curve evidence.

## Design system

Four colours, fixed roles — a fifth is never introduced:

| Role | Hex | Meaning |
| --- | --- | --- |
| Copper | `#BA7F5D` | the system is acting |
| Sage | `#8A9A7E` | this passed |
| Rust | `#A8493A` | this failed — never decorative |
| Warm brown | `#3E362F` / `#F6EFE7` | surfaces, borders, body text |

The copper and sage **fills** are mid-tones, so text usages deepen them
(`--qs-accent-ink`, `--qs-pass-ink`) to clear WCAG AA on the cream surface;
hotkey banners telegraph state with a filled chip plus ink text so colour is
never the only signal. Full light/dark palette is in `src/index.css`.

The palette is the one deliberate deviation from the design report (which
specifies a cool slate/blue system) — the build uses the earthy copper/sage/rust
family everywhere instead; every layout, section, copy, and number still follows
the report.

**Type:** IBM Plex — Sans (body/UI), Sans Condensed (display/headings), Mono
(data/labels). Self-hosted through `@fontsource`, so there is no third-party
font CDN. **Scale:** 28 / 20 / 16 / 14 / 13 / 12px — never below 12px, including
inside SVGs. **Icons:** Tabler outline, on a fixed concept mapping. No emoji
anywhere.

## Backend contract

`src/api/contract.ts` declares `QdsApi` and the HTTP route map; `src/api/types.ts`
holds every wire shape. The frontend never calculates a threshold, count,
percentage, probability or verdict — every number arrives in a response.

For the team building the engine, start with
**[`src/api/HANDOFF.md`](src/api/HANDOFF.md)**.

## Quick start

```
npm install
npm run dev        # http://localhost:5173
```

The app boots in **mock mode** with no server. To use a real backend:

```
VITE_API_MODE=http
VITE_API_URL=http://127.0.0.1:8000
VITE_API_TIMEOUT=15000
```

See `.env.example`.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then production build |
| `npm run preview` | serve the production build (`:4173`) |
| `npm run lint` | oxlint |
| `npm run smoke` | contract assertions (mock) + HTTP failure paths |
| `npm run audit` | headless Chrome layout/accessibility audit of every route |
| `npm run og` | Open Graph image generation |

`npm run smoke` drives the §11 route map and every event kind against the mock —
run creation, all nine attack options, the six live-simulation stages, the
streamed verification, results, history, and the binomial endpoint — then runs
`smoke-fail` against a dead port to assert the `NETWORK`/`TIMEOUT` error
surface. Run-failure meaning, terminology, and per-attack caughtBy claims are
asserted, not eyeballed.

`npm run audit` needs `npm run preview` running. It walks all six routes at
1440 / 834 / 390 in light (default) and dark (`-- --dark`) modes, checking
horizontal overflow, clipped text, sub-12px type, and WCAG AA contrast with a
physically-correct color pipeline (converts `oklab`/`oklch` computed values and
alpha-composites translucent fills). Fixture runs `e4f5a1` (forgery) and
`honest7` (accepted) cover the dense results dashboards. Screenshots land in
`.audit/` (gitignored).

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · react-router 7 · animejs ·
Tabler Icons · IBM Plex (Sans, Sans Condensed, Mono) · oxlint

No chart library. Every visualisation is hand-written SVG and every transition
is CSS or anime.js, which keeps the bundle around 123 kB gzipped and makes the
interface render identically under `prefers-reduced-motion`.

## Licence

MIT.