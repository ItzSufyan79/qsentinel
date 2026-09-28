# Backend handoff — SIH PS 26141

**For the team building the engine.** This file is the contract. The frontend
(`src/api/contract.ts`) declares it as `QdsApi`; implement that interface and
the frontend works unchanged. `scripts/smoke.ts` asserts the whole surface in
mock mode, and `scripts/smoke-fail.ts` asserts the error surface over HTTP.

Contract source: **UI/UX design report, section 6** (data contract summary).
Every component that displays live or historical data is mapped to one of
these endpoints. If a component has no endpoint, it is static.

## The one rule

The frontend never calculates a threshold, a count, a percentage, a
probability or a verdict. Every number the UI displays arrives in one of these
shapes. If a value is missing from a response, it does not exist in the
product — do not derive it in React, and do not send `0` where a value is
unknown; send `null` or omit the field.

## Endpoints

| Method | Path | Used by | Returns |
| --- | --- | --- | --- |
| GET | `/api/simulate/active` | Global nav badge | `ActiveResponse` |
| GET | `/api/simulate/preview?attack=&noise=&n=&verifier_count=&attack_fraction=` | New Simulation | `PreviewResponse` |
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
| GET | `/api/log?page=&filter=&verdict=&date=&search=` | Event Log | `LogPage` |
| GET | `/api/log/export?filter=&verdict=&date=&search=` | Event Log | CSV `Blob` |

All shapes are in `src/api/types.ts`. All values are finite numbers — no
`NaN`, no `null` in place of a number, except the two fields documented as
nullable (`predictedDetectionConfidence`, `confidence`).

### Preview and run parameters

`preview` is a `GET` and `createRun` a `POST`, and both describe the same
`SimulationParameters`: `attackType`, `noise`, `qubitsPerSlot`,
`verifierCount`, plus the optional `attackFraction` (partial only) and
`thresholdOverride`. The preview sends its parameters as a snake_case query
string (`attack`, `noise`, `n`, `verifier_count`, `attack_fraction`); the run
sends a snake_case JSON body and additionally accepts `threshold_override`.
`client.ts` does the conversion.

`PreviewResponse` must return the **valid ranges** (`supported`) alongside the
threshold it would derive, so the UI never hardcodes a slider limit. It is
called on every configuration change; keep it cheap and side-effect free. A
`404` here is treated as "not implemented" and the UI degrades to showing the
backend-derived data as unavailable — it does not fail the page.

## Attack model

Nine options, from spec section 4.2. `AttackTypeId` in `types.ts`:

`honest` · `forgery` · `impersonation` · `replay` · `intercept-fixed` ·
`intercept-random` · `partial` · `tampering` · `collusion`

`collusion` is the one that routes to the Arbitration page, and it is the only
attack that requires `verifierCount > 1`. `partial` is the only one with an
intensity slider (`attackFraction`), and it is the one that may legitimately
come back `not-detected` — a partial attack is a *weaker* attack, so a miss is
a correct result, not a false negative. The Results page states this rather
than hiding it.

`replay` is detected by `nonce-session-validation`, `tampering` by
`classical-mac`, and `collusion` by `verifier-cross-check`; those are the
mechanisms the backend must report in `flaggedBy`. The frontend never infers a
mechanism from the attack type.

`ResultResponse` also carries `rootCause`, `mitigation` and `severityScore`
(0–100) — the Results page renders all three.

## Optional fields

Two fields are genuinely optional and the UI handles each one explicitly:

- `StatsSummary.verifierAgreementRate` — absent means the backend does not
  track agreement; the dashboard renders "not reported", never a guess.
- `StatsSummary` carries no `partialAnalysis` field. The dashboard treats a
  `partial` row with `runs === 0` as "no data yet" and shows an empty state.

## Errors

`ApiErrorCode` is closed: `BAD_REQUEST`, `INVALID_PARAMS`, `UNSUPPORTED_ATTACK`,
`RUN_NOT_FOUND`, `CHANNEL_UNTRUSTED`, `INVALID_STATE`, `BACKEND_ERROR`,
`TIMEOUT`, `CANCELLED`. `client.ts` maps HTTP status → code (400/422 →
`INVALID_PARAMS`, 404 → `RUN_NOT_FOUND`, 409 → `CHANNEL_UNTRUSTED`, 412 →
`INVALID_STATE`, everything else → `BACKEND_ERROR`) and a transport failure
becomes `TIMEOUT` or `CANCELLED` depending on whether an abort fired. Message
text from the backend is surfaced verbatim; send something a judge can read.

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

Per-block `failed` counts and the run-level `verdict` are deliberately
separate: a verifier's aggregate verdict can differ from the run's
`detectionStatus` when only some blocks breach the threshold, and the UI shows
both rather than reconciling them.

## Determinism

`seed` is authoritative. Same seed + same inputs ⇒ byte-identical run. Do not
make the verification plan depend on wall-clock time.

## Trying it

```
# VITE_API_MODE=http
# VITE_API_URL=http://127.0.0.1:8000
```

## No AI/ML

The problem statement forbids it, twice. Detection is statistical: measure,
compare the distribution against the expected one, apply a threshold, decide.
No model, no classifier.
