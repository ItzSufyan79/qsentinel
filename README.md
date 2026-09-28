# QSentinel

Quantum-inspired cyber threat detection for digital signatures — **SIH PS 26141**
(Blockchain & Cybersecurity), by Egreen Quanta.

A software framework that simulates quantum public-key distribution using
Bell-state entanglement and quantum teleportation, applies Pauli correction and
projective measurements for signature verification, and detects malicious
activity through statistical evaluation and threshold-based decision rules.

Detection never uses AI or machine learning: it measures, compares the
distribution against the expected one, applies a threshold, and decides.

## Pages

Six top-level pages with a persistent nav bar, plus one hidden page reachable
only from a disputed verdict.

| Route | Page | Data |
| --- | --- | --- |
| `/` | Overview | `GET /api/stats/forgery-comparison` |
| `/simulate/new` | New Simulation | `GET /api/simulate/preview`, `POST /api/simulate/run` |
| `/simulate/run/:runId` | Live Simulation | `GET .../keygen`, `.../distribution`, `.../signing`, `.../verification` |
| `/simulate/run/:runId/result` | Results | `GET .../result` || `/simulate/run/:runId/arbitration` | Arbitration *(hidden)* | `GET .../arbitration` |
| `/dashboard` | Analytics Dashboard | `GET /api/stats/summary`, `.../by-attack-type`, `.../histogram`, `.../forgery-comparison` |
| `/log` | Event Log | `GET /api/log`, `GET /api/log/export` |

The nav bar carries a persistent badge that polls `GET /api/simulate/active`.
There is no footer.

The Results page shows a verdict stamp, the three stat cards, an animated
**quantum severity score** gauge (0–100), a **root cause & mitigation**
analysis, the flagged-by check, ground-truth diffs and per-verifier outcomes.
Live Simulation runs an animated quantum channel — photons flow signer →
verifier, and an attacker node interposes for intercepting attacks.

## Design system

Four colours, fixed roles — a fifth is never introduced:

| Role | Hex | Meaning |
| --- | --- | --- |
| Quantum violet | `#5B3FA0` | the system is acting |
| Signal teal | `#0C7A6C` | this passed |
| Signal red | `#C23B3B` | this failed — never decorative |
| Slate | `#2A2E37` / `#F4F5F7` | surfaces, borders, body text |

**Type:** Fontshare — Clash Display (display/headings), General Sans (body/UI),
Nippo (data/monospace). Three visually distinct families, so display, body and
data never read as the same face. **Scale:** 28 / 20 / 16 / 14 / 13 / 12px —
never below 12px. **Icons:** Tabler outline, on a fixed concept mapping. No
emoji anywhere.

The full build spec is the UI/UX design report (PS 26141, Egreen Quanta). Every
component is drawn from the inventory in `src/components/ui/atoms.tsx` —
`StatusBadge`, `PhaseStepper`, `DataCard`, `ParamSlider`, `EventLogRow`,
`ComparisonBar`, `VerifierPanel`.

## Backend contract

`src/api/contract.ts` declares `QdsApi` — fifteen methods, an HTTP route map,
and a typed error taxonomy. `src/api/types.ts` holds every wire shape.

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
| `npm run preview` | serve the production build |
| `npm run lint` | oxlint |
| `npm run smoke` | headless run of all contract assertions |
| `npm run audit` | headless Chrome layout/contrast audit of `/` |

`npm run smoke` drives the whole flow against the mock — attack catalogue, run
creation, every live-simulation phase, the streamed verification, the result,
arbitration, analytics and the event log — plus the HTTP failure path against
a dead port. 44 checks.

`npm run audit` needs a running `npm run preview`. It checks horizontal
overflow, clipped text, sub-12px type, and WCAG AA contrast at 1440 / 834 /
390. Add `-- --dark` for dark mode. Screenshots land in `.audit/` (gitignored).

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · react-router 7 · animejs ·
Tabler Icons · Fontshare (Clash Display, General Sans, Nippo) · oxlint

No chart library. Every visualisation is hand-written SVG and every transition
is CSS or anime.js, which keeps the bundle at ~113 kB gzipped and makes the
interface render identically under `prefers-reduced-motion`.

## Licence

MIT.
