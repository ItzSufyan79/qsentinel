# Backend handoff — SIH PS 26141

**For the team building the engine.** This file is the contract. The frontend
(`src/api/contract.ts`) declares it as `QdsApi`; implement that interface and
the frontend works unchanged.

Contract source: **UI/UX design report, section 6** (data contract summary).
Every component that displays live or historical data is mapped to one of
these endpoints. If a component has no endpoint, it is static.

## The one rule

The frontend never calculates a threshold, a count, a percentage, a
probability or a verdict. Every number the UI displays arrives in one of these
shapes. If a value is missing from a response, it does not exist in the
product — do not derive it in React.

## Endpoints

| Method | Path | Used by | Returns |
| --- | --- | --- | --- |
| GET | `/api/simulate/active` | Global nav badge | `ActiveResponse` |
| GET | `/api/simulate/preview?attack=&n=&threshold=` | New Simulation | `PreviewResponse` |
| POST | `/api/simulate/run` | New Simulation | `RunResponse` |
| GET | `/api/simulate/{run_id}/keygen` | Live Simulation | `KeygenResponse` |
| GET | `/api/simulate/{run_id}/distribution` | Live Simulation | `DistributionResponse` |
| GET | `/api/simulate/{run_id}/signing` | Live Simulation | `SignResponse` |
| GET | `/api/simulate/{run_id}/verification` | Live Simulation | `VerifyEvent` stream |
| GET | `/api/simulate/{run_id}/result` | Results | `ResultResponse` |
| GET | `/api/simulate/{run_id}/arbitration` | Arbitration | `ArbitrationResponse` |
| GET | `/api/stats/summary` | Dashboard | `StatsSummary` |
| GET | `/api/stats/by-attack-type` | Dashboard | `ByAttackTypeRow[]` |
| GET | `/api/stats/histogram` | Dashboard | `HistogramResponse` |
| GET | `/api/stats/forgery-comparison` | Overview, Dashboard | `ForgeryComparison` |
| GET | `/api/log?page=&filter=` | Event Log | `LogPage` |
| GET | `/api/log/export?filter=` | Event Log | CSV `Blob` |

All shapes are in `src/api/types.ts`. All values are finite numbers — no
`NaN`, no `null` in place of a number.

## Attack model

Nine options, from spec section 4.2. `AttackTypeId` in `types.ts`:

`honest` · `forgery` · `impersonation` · `replay` · `intercept-fixed` ·
`intercept-random` · `partial` · `tampering` · `collusion`

`collusion` is the one that routes to the Arbitration page. `partial` is the
only one with an intensity slider.

## The three numbers judges will ask for

They are derivable from the stats endpoints and the result:

1. **Honest acceptance probability = 1.** Deterministic, not "usually". An
   untampered signature is always accepted.
2. **Observed forgery probability ≤ claimed bound.** Should decay with block
   count. `GET /api/stats/forgery-comparison` returns the classical vs. quantum
   pair; the curve is the most persuasive chart we can show.
3. **False positives = 0.** Honest runs never produce a false rejection.

## Streaming

`GET /api/simulate/{run_id}/verification` is an SSE stream of `VerifyEvent`,
one per block, in order. A bare `{"done": true}` control frame is not an
event — the client drops it. Aborts promptly on `ctx.signal`.

## Determinism

`seed` is authoritative. Same seed + same inputs ⇒ byte-identical run. The
frontend exposes the seed in the URL so any run is reproducible from a shared
link. Do not make the verification plan depend on wall-clock time.

## Trying it

```
# VITE_API_MODE=http
# VITE_API_URL=http://127.0.0.1:8000
```

## No AI/ML

The problem statement forbids it, twice. Detection is statistical: measure,
compare the distribution against the expected one, apply a threshold, decide.
No model, no classifier.
