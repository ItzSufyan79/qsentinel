# Backend handoff — SIH PS 26141

You are building the quantum side. This file is the whole contract.

## The one rule

**The frontend never computes a threshold, a count, a percentage, a probability
or a verdict.** Every number on screen arrives in one of the shapes in
`src/api/types.ts`. If a value is missing from a response, it does not exist in
the product — we do not derive it in React.

Consequence: no thresholds, no percentages and no "expected distribution" logic
on the client. Send the numbers; we draw them.

## What to implement

Twelve methods, declared in `src/api/contract.ts` as `QdsApi`. Implement that
interface and the frontend works unchanged.

| Method | Deliverable | What it must return |
| --- | --- | --- |
| `init` | 5 | `runId`, `seed`, hardware profile, verifier options |
| `keygen` + `streamKeygen` | 1 | pool shape, then live progress ticks |
| `distribute` + `streamDistribution` | 1 | per-verifier receipt ticks |
| `channelHealth` | 2 | score in [0,1], `bands`, explanation |
| `sign` | 3 | `encoded` string (one char per block), ids, `sentTo` |
| `launchAttack` | 4 | attack label, intensity, Eve's knowledge panel |
| `planVerification` | 2 | the deterministic block plan |
| `streamVerification` | 2 | one `VerifyEvent` per block, in order |
| `agreementFor` | 2 | unanimous / dissenters |
| `buildReport` | 5 | everything the dashboard shows |
| `buildLogs` | 5 | the tamper-evident event log |
| `fetchEvidence` | 5 | the export blob |

Three more are declared on `QdsApi` as **optional** — they only feed the
Protocol page, so a backend that omits them still passes the core demo:

| Optional method | Route | What it must return |
| --- | --- | --- |
| `fetchBellState` | `GET /runs/:runId/protocol/bell` | `BellStateResponse` |
| `fetchTeleportTrace` | `GET /runs/:runId/protocol/teleport` | `TeleportTrace` |
| `fetchMeasurements` | `GET /runs/:runId/protocol/measure` | `MeasurementSeries[]` |

`ROUTES.protocolForgery` (`GET /runs/:runId/protocol/forgery`) is reserved but
not yet called by the client: Page 6 reads the forgery curve from
`buildReport` as `report.forgeryCurve`. If you implement the standalone route,
send the same `ForgeryCurve` shape and it can be wired later without a
breaking change.

## The three numbers judges will ask for

They belong in `DashboardReport.security` (`SecuritySummary` in `types.ts`),
and Page 5 renders them under the **Guarantee** tab:

1. `honestAcceptanceProbability` — legitimate signatures accepted with
   probability **1**. Deterministic, not "usually".
2. `observedForgeryProbability` + `claimedForgeryBound` — should decay with
   block count. The curve is the most persuasive chart we can show.
3. `falsePositives` — honest runs that produced a false rejection. Must be `0`.

## The Protocol page endpoints

The PS names four primitives we have to *display*: Bell-state entanglement,
teleportation, Pauli correction, projective measurement. They are read-only
additions, so the five core pages work without them — the routes are listed in
the optional-methods table above.

Shapes are in `src/api/types.ts` (`Amplitude`, `TeleportStep`,
`MeasurementSeries`, `ForgeryCurve`). **Plain numbers only** — we plot
`probability` fields you send, we never square amplitudes ourselves. Set
`probabilities` to sum to 1 per state.

## Route map

`ROUTES` in `contract.ts` lists the exact paths `client.ts` calls. Change a
path there and nothing else moves.

## Streaming

Long work is SSE, not polling. Frames are plain `data: {json}` lines separated
by a blank line; the last frame carries `done: true`. `client.ts` already
parses it, including abort-on-Skip and reconnect-free timeouts.

## Determinism

Same `seed` + same inputs must give a byte-identical run. `init` accepts a
seed, and we put it in the URL (`?seed=…`) so any demo run is reproducible from
a shared link. `planVerification` must not depend on wall-clock time — we
compute the whole plan up front so Skip can jump to the end.

## Trying it

```bash
cp .env.example .env.local
# VITE_API_MODE=http
# VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

Leave `VITE_API_MODE=mock` and the app runs standalone with no server, so a
failed backend never takes the demo down.

## No AI/ML

The problem statement says this twice, explicitly. Detection is statistical:
measure, compare the distribution to the expected one, threshold, decide. No
model, no classifier.

## If the backend is not ready for the demo

Build against the mock. `VITE_API_MODE=mock` is the default and needs no
server. Say so early rather than stubbing silently — the UI already labels
simulated results.
