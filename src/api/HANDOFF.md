# Backend handoff — SIH PS 26141

**For the team building the engine.** This file is the contract. `src/api/contract.ts`
declares it as `QdsApi`; implement that interface and the frontend works
unchanged. `scripts/smoke.ts` asserts the whole surface in mock mode, and
`scripts/smoke-fail.ts` asserts the error surface over HTTP.

Contract source: **UI/UX design report, sections 6 and 11** (data contract and
route table). Every component that displays live or historical data is mapped
to one of these endpoints. If a component has no endpoint, it is static.

## The one rule

The frontend never calculates a threshold, a count, a percentage, a
probability or a verdict. Every number the UI displays arrives in one of these
shapes. If a value is missing from a response, the UI renders the report's
"Not run" card for that section — it does **not** derive it in React, and it
does **not** send `0` where a value is unknown. Send `null` or omit the field.

## Routes

| Method | Path | Used by | Returns |
| --- | --- | --- | --- |
| POST | `/api/runs` | New Simulation | `CreateRunResponse` |
| GET | `/api/runs/{id}/events` | Live Simulation | SSE of `RunEvent`, resolves on DONE |
| GET | `/api/runs/{id}/result` | Results | `ResultResponse` |
| GET | `/api/runs/{id}/logs?stage=&actor=&level=&q=` | System Logs | `LogRow[]` |
| POST | `/api/runs/{id}/rerun` | Results | `RerunResponse` |
| GET | `/api/analysis/binomial?n=&p_honest=&p_cheat=` | Results (bag-distribution chart) | `BinomialResponse` |
| GET | `/api/history` | History | `HistoryResponse` |

The route map lives in `ROUTES` in `contract.ts`. All wire shapes are in
`src/api/types.ts`. `/api/analysis/binomial` is a pure, cacheable
computation — the frontend passes the run's `n`, `pHonest`, `pCheat` **backed
by the result payload** and never computes the curves itself.

## Fixed system parameters

Report 2.2 / §5.5. These are backend-controlled and shown read-only with a
lock icon; the frontend hardcodes them only as a fallback display:

- 128 slots per bag, 63 bags, pass line 12 wrong-of-128
- fidelity gate 0.5
- verifiers: Bob and Charlie
- honest error rate 0.02 (2 wrong-of-128 expected per bag)

The pass line, both error probabilities, and every Fidelity/Severity number
arrive in the responses. `passLineOf()`/`passLineFor()` in the mock are
probabilistic helpers only — do not replicate thresholds in React.

## Run creation

`POST /api/runs` bodies are snake_case (report §11): `attack`, `subtype`,
`message`, `tampered_message`, `target_link`, `fixed_basis`, `intensity_pct`,
`replay_type`. `client.ts` converts `RunConfig` ↔ wire form. Respond with
`{ session_id, seed, config }` where `config` is the resolved `RunConfig`
echoed back for reproducibility.

## Event stream

`GET /api/runs/{id}/events` is an SSE stream delivering one frame per emitted
event, in order. `RunEvent` kinds, with `tMs` in ms since run start:

`session` → `fidelity` → `keys` → `distribute` → `sign` → `inject` →
`verify-bag` (repeated per bag) → `verify-done` → `analysis` → `log` → `done`

The page buffers frames and drives its own playback, so the stream should not
be artificially paced by the server. `inject` is the attack insertion frame —
emit it after `sign` with the attack's real parameters. A bare
`{"done": true}` control frame is not an event; the client drops it. Abort
promptly on the request signal. No frame ever carries secret key material
(`keys` sends `bits`, a digest-style string per bag, plus `openedBags`).

`verify-done`/`analysis`/`done` carry the numbers the Results page will show,
so the result route can be served from the store without re-computing.

## Result payload

`ResultResponse` = `sessionId`, `seed`, `message`, `verdict` (`ACCEPTED` /
`REJECTED`), `classification`, `confidence` (0–1), `story` (report §10.1),
`stoppedAt`/`injectedAt` (stage ids), `attackPath` (§7.3), and `verdictBanner`
(`ResultEnvelope`):

- `severity` — score + `confidencePart`, `deviationPart`, `categoryPart`
- `fidelityTest` — `F`, `gate`, `passed`, `referenceFake`, `failReason`
- `ledger` — replay only: `queriedId`, `found`, `status`, `reason`
- `verifiers` — per-verifier `VerifierReport`: verdict, `bagsWrong` (63),
  `rates` (Z/X/Y), passed/failed, worst bag
- `agreement` — Bob vs Charlie consistency + reason
- `fingerprintMatch` — best/runner-up distances + `library` table
- `why` — the three-step reasoning chain with this run's real numbers (§7.3)
- `attackConfig` — full echo incl. `injectedBetween` and `caughtBy`
- `bchDiff` — message-substitution only
- `correctionBits` — correction-bit only
- `detectionCurve` — partial / stealth only
- `bagDistribution` — binomial evidence for this run's `n` (§7.4)

A section whose data source is not applicable (e.g. `ledger` on a non-replay
run) must carry `null`, so every Results card can tell "no data" from "failed".

## Attacks (nine options, report §4.2)

`no-attack` · `forgery` · `impersonation` · `replay` · `tampering`
(`fixed-basis`, `random-basis`, `partial`, `message-substitution`,
`correction-bit`).

Mechanisms are reported in `caughtBy`/`attackPath.caught` and never inferred
by the UI from the attack type. Crossing the bag threshold is always shown
with *where* (Bob/Charlie), and the fingerprint `bestLabel` names the
detected pattern. `partial` is a weaker attack, so a miss is a correct result,
not a false negative — the UI states this instead of hiding it.

**Terminology is part of the contract.** The report reserves specific wording:
"bags", "slots", "pass line", "fidelity test", "session ledger", "correction
bits", "fingerprint", "Bob"/"Charlie", "Eve". Words from the earlier concept
— "block", "collusion", "arbitration", "verifier-cross-check", "classical-mac",
"malicious", "compromised" — do not appear anywhere in the UI.

## Determinism

`seed` is authoritative. Same seed + same inputs ⇒ byte-identical run. Do not
make the verification plan depend on wall-clock time.

## Optional fields

- `VerifierReport.bagsWrong` / `rates` — `null` when a verifier did not
  complete verification ("NOT RUN" verdict).
- `ResultResponse` — `stoppedAt` is set when a stage gates the run offline
  (fidelity / ledger); otherwise `null`.
- Missing sections on the banner → the corresponding report card renders
  "Not run".

## Errors

`ApiErrorCode` is closed: `NETWORK`, `TIMEOUT`, `ABORTED`, `RUN_NOT_FOUND`,
`INVALID_PARAMS`, `INVALID_STATE`, `BACKEND_ERROR`. `client.ts` maps HTTP
status → code (404 → `RUN_NOT_FOUND`, 400/422 → `INVALID_PARAMS`, 409 →
`INVALID_STATE`, everything else → `BACKEND_ERROR`) and a transport failure
becomes `NETWORK`/`TIMEOUT`/`ABORTED` based on cause. `RUN_NOT_FOUND` renders
the report's "Session not found" card with an inline recovery action.

## Trying it

```
# VITE_API_MODE=http
# VITE_API_URL=http://127.0.0.1:8000
npm run smoke        # mock surface assertions
npm run smoke:fail   # HTTP error-path assertions against a dead port
```

## No AI/ML

The problem statement forbids it, twice. Detection is statistical: measure,
compare the distribution against the expected one, apply a threshold, decide.
No model, no classifier.