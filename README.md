# QSentinel

**Quantum-Inspired Cyber Threat Detection for Digital Signature Security**

A working prototype of Quantum Digital Signature (QDS) — the post-quantum
replacement for RSA and elliptic-curve signatures — built for
[SIH PS 26141](https://sih.gov.in/sih2026PS) (Egreen Quanta LLP).

Quantum computing breaks today's public-key cryptography through Shor's
algorithm. A Quantum Digital Signature is the answer: one whose security comes
from physics and measurement statistics rather than from a problem that is
merely computationally hard. Real hardware cannot run it yet, so the protocol is
simulated — which is what "quantum-inspired" means here.

> **Status:** frontend complete, running on simulated data. The quantum engine
> is behind a typed API seam and is being built in parallel — see
> [`src/api/HANDOFF.md`](src/api/HANDOFF.md).

---

## The run

A single locked five-step sequence, plus one additive page. Navigation through
the five core stages is sequential by design; you cannot jump ahead of the
simulation. The Protocol page unlocks once verification completes.

| Page | Stage | What you see |
| --- | --- | --- |
| 1 | Key generation | 2-qubit register, block split, live tile grid filling as the pool is generated |
| 2 | Key distribution | 12,600 keys dispatched across three verifiers, with a health meter and an explained threshold |
| 3 | Sign | the message encoded one character per block, then an attack injected via a live Eve wire |
| 4 | Verify | block-by-block results streamed in, with the expected-vs-observed distribution and agreement |
| 5 | Dashboard | classification, fingerprint, heatmap, ROC curve, forged-vs-genuine bars, event log, evidence export |
| 6 | Protocol | Bell-state amplitudes, teleportation trace with Pauli correction, measurement histogram |

Page 5 has four tabs — **Overview**, **Analytics**, **Guarantee**, **Log**.
Guarantee is where the three judge-facing numbers live: honest acceptance
probability, observed forgery probability against the claimed bound, and false
positives.

Page 6 is read-only and optional. If the backend does not implement the three
protocol endpoints, the page falls back to fixtures and the five core pages are
unaffected.

The channel can be forced to fail at any point, in which case the flow refuses to
proceed — refusal is part of the demonstration, not an error.

## The one architectural rule

**The frontend computes no thresholds, counts, percentages, probabilities or
verdicts.** Every number rendered comes from a backend response defined in
[`src/api/types.ts`](src/api/types.ts).

This exists for two reasons. It keeps the detection logic honest — the PS
forbids AI/ML and mandates statistical threshold rules, so the arithmetic lives
in one auditable place. And it makes the backend swappable: the same UI runs
against the local simulation or a real engine with no code change.

```
Pages & components
      |
      v
src/api/index.ts          <- the seam, reads VITE_API_MODE
    |            |
    v            v
mockAdapter.ts     client.ts          <- HTTP + SSE
    |            |
    v            v
mockApi.ts      YOUR BACKEND
```

Only `src/api/index.ts` knows which one is active. Nothing above the seam
imports a backend directly.

## Quick start

```bash
npm install
npm run dev
```

That is the whole setup. The app boots and runs the full flow with no server
and no configuration.

### Against a real backend

```bash
cp .env.example .env.local
# VITE_API_MODE=http
# VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_MODE` | `mock` | `mock` for the local simulation, `http` for a real engine |
| `VITE_API_URL` | `http://127.0.0.1:8000` | backend base URL |
| `VITE_API_TIMEOUT` | `15000` | per-request timeout in ms |

Everything prefixed `VITE_` is inlined into the public bundle — put no secrets
here. See `.env.example`.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then production build |
| `npm run preview` | serve the production build |
| `npm run lint` | oxlint |
| `npm run smoke` | headless run of all flow assertions, no browser needed |
| `npm run audit` | headless Chrome layout/contrast audit of pages 1–2 |
| `npm run audit -- --deep` | also drives the flow and screenshots each page it reaches |

`npm run smoke` covers the whole sequence end to end — keygen, distribution,
signing, attack, streamed verification, report generation, protocol fixtures,
security summary, navigation locking, and the failure branch that must halt the
run. It runs in about a second, so there is no excuse for shipping a broken
demo.

`npm run audit` needs a running `npm run preview`. It checks horizontal
overflow, clipped text, sub-9px type, and WCAG AA contrast at 1440 / 834 / 390.
Screenshots land in `.audit/` (gitignored). Its `--deep` driver currently walks
pages 1 and 2 only — **pages 3–6 have not been machine-audited and need a human
pass** in the browser.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · Zustand · oxlint

No chart library and no animation library. Every visualisation is hand-written
SVG and every transition is CSS, which keeps the bundle at ~95 kB gzipped and
makes the interface render identically under `prefers-reduced-motion`.

## Design

The interface is a laboratory instrument, not a dashboard template: square
corners, hairline rules, monospace labels, ruled measurement bands and
hatch-pattern loading skeletons. Accuracy is expressed through
`tabular-nums`, explicit units and visible thresholds rather than through
decoration. The palette is a single system that flips to dark mode.

## Backend contract

`src/api/contract.ts` declares the `QdsApi` interface — twelve required
methods, three optional protocol methods, an HTTP route map, and a typed error
taxonomy. `src/api/types.ts` holds every wire shape, including optional quantum
extensions for Bell-state, teleportation, measurement and forgery-probability
data.

For the team building the engine, start with
**[`src/api/HANDOFF.md`](src/api/HANDOFF.md)** and the long-form
`QSentinel-Backend-Spec.docx`.

## Constraint worth restating

The problem statement forbids artificial intelligence and machine learning, and
says so twice. Detection here is statistical: measure, compare the distribution
against the expected one, apply a threshold, decide. No model, no classifier.

## Licence

Private — internal project for SIH 2026.
