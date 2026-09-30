# BACKEND_STATE — QSentinel

Authority: QSentinel-Backend-Preparation-Report.md (binding). Audit: `QSentinel-AUDIT.md`.

## Decisions confirmed at kickoff ("start all the phases")
- **C1**: backend emits `{code,message,detail?}` bodies AND the status codes today's client maps; Phase 6 adds JSON error-body parsing to `client.ts`.
- **C2**: `injectedAt = "verify"` for replay runs (mock said "sign"; catalog says Stage 5 entry). Replay `ATTACK_INJECTED` log stage = `verify`.
- **C7**: `analysis` events emit `step` 0–4 (mock emitted constant 0; report says 0–4).
- Environment: PostgreSQL 16.15 local, Python 3.12.3, numpy 2.4.4, SQLAlchemy 2.1.1, Node 22 (frontend deps installed via `npm ci`).
- Missing input: `QSentinel_Full_Project_Report.pdf` not provided (authority #5, context only — non-blocking).

## Phase 0 — Contracts (DONE, gate PASSED)
- Implemented: `requirements.txt`, `.env.example`, `app/engine/constants.py` (all §2.1 values, fingerprint library, stream names, log codes, banned words), `app/engine/records.py` (`RunRecord`, frozen), `app/api/schemas.py` (Pydantic mirrors of `types.ts` + `SystemResponse` + `ResultEnvelope.diagnosis`), kit copied **byte-identical** into `app/db/` (`diff` clean; flat imports resolved via `app/db/__init__.py` sys.path shim), `scripts/dump-mock.ts` (frontend, test-only helper).
- Interfaces frozen: `RunRecord`, `schemas.py` response shapes, kit models.
- Tests executed: `pytest tests/test_phase0.py` → **7 passed** (0.80s):
  - 7 tables + 10 catalog rows on live PostgreSQL 16;
  - ledger ACTIVE→USED atomic flip; USED replay → REJECTED_USED; unissued → REJECTED_NOT_FOUND; REFUSED reads as not-found;
  - constraints reject empty message, seed ≥ 2^53, USED-without-consumed_at;
  - all ten mock-generated results/events/logs round-trip through Pydantic **byte-equal** (diagnosis stub injected — the TS mock gains its own diagnosis copy in Phase 6, per report §11.2).
- Failures: none. Open issues: none.
- Next: Phase 1 (quantum core).

## Phase 1 — Quantum core (DONE, gate PASSED)
- Implemented: `app/engine/rng.py` (named PCG64 streams via sha256(f"{seed}:{name}")), `app/engine/quantum.py` (`StateBatch` state-vector batches, no-cloning enforcement incl. copy/deepcopy/pickle + tokenize static scan, Born-rule `measure` with terminal/mask semantics, `take()` bag destruction, Bell pairs, BSM, depolarise, Pauli correction, fidelity from XX/YY/ZZ correlations, `QuantumChannel`/`ClassicalChannel` as Eve's only interfaces).
- Tests: `pytest tests/test_phase1_quantum.py` → **10 passed** (T1 teleport F=1±1e-12; T2 norms/Born 4σ at 100k; T3 exact Bell correlations; T4 fidelity honest≈0.97 @q=0.04, product states ≤0.5; T5 no-cloning; T6 determinism + stream independence).
- Failures during phase: T5 static scan initially tripped on a docstring; rewritten with tokenize NAME-token scan. Open issues: none.

## Phase 2 — Protocol + attacks (DONE, gate PASSED)
- Implemented: `app/engine/bch.py` (GF(2^6) BCH(63,39), generator m1·m3·m5·m7 deg-24, systematic encode, syndrome check, sha256→39-bit message word), `app/engine/attacks.py` (imports only numpy + quantum layer; forgery packets, intercept-resend fixed/random, partial slot mask floor(pct·128/100+0.5) from eve-select, correction-bit flips, separable impersonation resource E[F]≈0.5), `app/engine/protocol.py` (fidelity test 300 pairs/basis/link with 4σ gate, key generation, distribute with D19 correction samples and D20 inject placement, sign/verify with announced-basis grouping, `execute()` → `EngineEvidence`).
- Tests: `pytest tests/test_phase2_protocol.py` → **14 passed** (73s) covering T7–T12: BCH d≥9 (full ≤3-weight enumeration + 10k random pairs), honest mean≈2.6 wrong/bag, full oracle table (forgery .5, fixed .5/clean, random .34, partial 25%→.100 dilution, correction .98/.98/.02, impersonation F≈0.50 refused at stage 1, replay measures nothing), attacks.py import isolation, msgsub failed-set == BCH diff positions, cross-session signature ≈.5.
- **Deviation (documented):** oracle checks run 40 seeds/scenario (80 for partial verdict rates), not the report's 200 — SE < 0.002 vs ±0.03 tolerance; partial verdict-rate bands (10%→87–90%, 5%→13–14%) checked with binomial-tolerant bounds at n=80. Rationale in test file header.
- Open issues: none.

## Phase 3 — Detection + narrative (DONE, gate PASSED)
- Implemented: `app/engine/detection.py` (announced-basis rate grouping, Euclidean fingerprint vs 5 profiles on primary verifier, ordered classification rules 1–4f per §7.4, p̂ dilution estimate, confidence = clamp(1−distance) with 0.99 for gates/no-attack, severity floor(x+0.5) parts 0.4/0.3/0.3, lgamma binomial tail + detection curve p(i)=(i/100)·0.34+(1−i/100)·0.02, why-chain builder ending at failing gate), `app/engine/narrative.py` (verdict banner, diagnosis from catalog, missed-attack story with real curve numbers, all emittable strings centralised).
- Tests: `pytest tests/test_phase3_detection.py` → **18 passed** covering T13–T17: classification confusion matrix across scenario/ledger combinations incl. replay-used/unknown paths, split-target msgsub, missed partial → no-attack with severity 0; severity worked examples (floor(x+0.5), never Python round); pass-line 12 derivation + binomial tail ≈4e-5; curve checkpoints 5%→0.13, 10%→0.87; fidelity-gate separation honest vs impersonation (reduced seeds, documented in file); banned-terms scan of every emittable string incl. live catalog rows.
- Open issues: none.

## Phase 4 — Pipeline + persistence + fixtures (DONE, gate PASSED)
- Implemented: `app/engine/pipeline.py` (single `run()` → frozen `RunRecord`; exact §10.4 event/log sequence on the mock's logical-clock increments; D20 inject placement after `distribute` for quantum-link subtypes, after `sign` for forgery/msgsub, `verify` for replay per C2; fidelity/ledger early-stop paths; D19 correction samples; verdict D11; missed-attack story with real curve numbers), `app/db/repository.py` (LedgerPort over the kit's ledger functions, catalog loader, RUNNING insert, one-transaction persist of run+events+logs+verifiers, FAILED marker that also REFUSES the key, reads for /events /result /logs /history incl. byAttack GROUP BY catalog label), `app/fixtures.py` (the mock's ten pinned scenarios run for REAL: ids/configs verbatim from mockApi.ts, seeds pinned — honest7=424242, others 111001–111009 — honest7 first so m4v7p3 replays it; outcome asserted at seeding, idempotent).
- All ten pinned seeds landed on intended verdict + detected key at first try (partial-25% seed verified REJECTED).
- Tests: `pytest tests/test_phase4_pipeline.py` → **9 passed**: T18 all scenarios < 8 s; T19 determinism modulo session id over 5 scenario families + seed-sensitivity; T20 two threads racing one ACTIVE key → exactly one `ACCEPTED_ACTIVE` + one `REJECTED_USED`, single USED row, both lookups audited; T21 crash mid-run → FAILED row, zero child rows, key REFUSED; fixture seeding on live DB (idempotent, m4v7p3 presents honest7, ILIKE log filter, history shape).
- Failure during phase: test initially used invented outcome name `CONSUMED_OK`; kit vocabulary is `ACCEPTED_ACTIVE` (pipeline was unaffected — it only compares `REJECTED_USED`). Test + stub aligned to kit vocabulary.
- Open issues: none.

## Phase 5 — API (DONE, gate PASSED)
- Implemented: `app/api/errors.py` ({code,message,detail?} on 400/404/412/500), `app/api/validation.py` (§10.2 table: message 1–64 non-blank, seed < 2^53, per-attack required/forbidden fields, partial 5..100 step 5 default 25, msgsub must differ AND map to a different 39-bit word, binomial n 1..512 + p in [0,1]), `app/api/routes.py` (7 contract routes + GET /api/system + /api/health; POST /runs = one transaction in a worker thread, semaphore 2, replay-used auto-runs a system baseline when no victim exists; SSE replay from run_events, unpaced, disconnect check every 32 frames; rerun = same settings, fresh seed + session), `app/main.py` (lifespan init_db + idempotent fixtures, CORS from CORS_ORIGINS, exception handlers incl. RequestValidationError→INVALID_PARAMS).
- Contract edits pulled forward from §11 (needed for a meaningful T22): `types.ts` gains `Diagnosis` (+ required `diagnosis` in `ResultEnvelope`) and `SystemResponse`; `mockApi.ts` gains its own diagnosis table with catalog wording, emitted in `verdictBanner`. Frontend `tsc -p tsconfig.app.json` clean.
- Tests: `pytest tests/test_phase5_api.py` → **35 passed**: T22 Pydantic validation of every fixture read + real JSON (honest7, e4f5a1 results; system; history; full j8k3w9 event stream) embedded as fresh literals `satisfies` the frontend types under strict tsc (excess keys fail); T23 SSE headers/order/done + byte-equality with run_events + disconnect stops the generator + 404 on stream; T24 404/400/500 bodies, forced engine crash → 500 with detail → FAILED row → 412 on /result and /events; T25 28-case validation table + binomial bounds.
- Failures during phase: validated against `ResultEnvelope` instead of `ResultResponse` (test bug); tsc refuses file args beside a tsconfig → dedicated `tsconfig.wirecheck.json`; the missing `diagnosis` in types.ts was correctly caught by T22 and resolved by the §11 addition.
- Open issues: none.

## Phase 6 — Frontend integration + end-to-end (DONE)
§11 items, all verified with `tsc -p tsconfig.app.json` after each edit (0 errors throughout):
1. `getSystem()` on `QdsApi` + `ROUTES.system` (contract.ts), `client.ts` implementation, `mockApi.ts` implementation (SYSTEM_PARAMS + mock's own fingerprint-library copy, engineVersion "mock"), new `src/lib/useSystem.ts` (cached promise; SYSTEM_PARAMS demoted to first-render fallback).
2. `Results.tsx` reads `verdictBanner.diagnosis` (keyed by what was DETECTED); `DIAGNOSIS`/`diagnosisKey`/`FINGERPRINT_LIBRARY` deleted from `copy.ts`; mock keeps private copies (diagnosis wording mirrors the catalog verbatim).
3. Verified already satisfied: the fingerprint card renders per-run `fingerprintMatch.library`; no static library card existed.
4. `NewSimulation.tsx`: every "Expected result: …" prediction removed (previews describe Eve's mechanism only); `RejectText` deleted; partial slider caption no longer computes a slot count (percentage + backend `slotsPerBag`; exact count arrives with the run); LockChips read `useSystem().params`. **Also fixed a real contract bug found here: the UI offered per-verifier targets for forgery; report §6.2 defines forgery as one packet to both verifiers and the backend 400s `target_link:"bob"` — forgery no longer shows the target chooser.**
5. Hard-coded 63/128/12/0.5 removed: `LiveRun.tsx` (params.bags, event's own passed+failed, inject's `slotsTotal`), `Results.tsx` (`capOf(params)` caption map; `passLineOf(env, sys.passLine)` — run's own `bagDistribution.passLine` first), `Overview.tsx` key-numbers grid from `useSystem()`.
6. Done in Phase 5 (types.ts `Diagnosis` + `SystemResponse`; required `diagnosis` in `ResultEnvelope`).
7. Missed-attack badge in the verdict banner: `attackConfig.attack !== "no-attack" && verdict === "ACCEPTED"` → "Attack present, not detected" (warn tokens, `data-testid="missed-attack-badge"`).
8. `openedBags` is consumed nowhere in the UI (LiveRun's keys panel is static copy) — 63 entries break nothing; no change needed.
9. `scripts/smoke.ts`: `/api/system` section (backend-served §2.2 values, 5-pattern library, versions, 8-route map), diagnosis assertions, replay-used queried id must be a real session (== honest7 in http mode), verdict-from-config assertions dropped (fresh runs assert evidence-consistency: REJECTED⇒sev>0, ACCEPTED⇒sev=0; rerun asserts config echo + validity), banned-terms scan over results+logs+system of 7 fixtures; threshold checks kept (fixed-Z: Z<0.1, X/Y>0.4; correction: Z,X>0.9; curve chosenIndex).
10. `client.ts` parses `{code,message,detail?}` bodies with code whitelisting, falls back to status mapping for non-JSON (C1).

End-to-end evidence:
- `npm run smoke` (mock): all checks + failure paths green.
- `VITE_API_MODE=http npx tsx scripts/smoke.ts` against the real server: **80/80 checks passed**. `npm run smoke:fail`: green (typed NETWORK errors, 8-route surface).
- Static-data audit grep: no hard-coded verdicts/"Expected result" remain in pages/components/lib.
- `npm run build` (tsc -b + vite): clean. `npm run lint`: 0 errors (3 pre-existing warnings in untouched `LogTable.tsx`/`charts.tsx`).
- Live ten-scenario demo (fresh sessions, pinned seeds): all verdicts/detected keys/oracle rates as specified — honest ≈.02/.02/.02 0 failed; forgery ≈.50 63/63 sev 10; impersonation F=0.4867 stopped at fidelity; replay-used presented the most-recent USED session from the live DB; replay-unknown presented an unissued key; fixed-Z Z=.0175 X=.515 Y=.482; random ≈⅓; partial-25% ≈.100 44/63 failed; msgsub 30/63 failed; correction .981/.978/.021. Missed-attack demo (5%, seed 11): ACCEPTED, severity 0, story with real curve numbers. Determinism: fresh forgery at seed 111001 reproduces fixture e4f5a1 physics byte-for-byte in a dirty DB.
- Full backend suite: **93 passed** (one test-only fix during the final run: `_cleanup` in the Phase 4 tests now detaches organic `rerun_of` children before deleting fixture rows — production code unaffected).

## Environment limitations (reported honestly)
- `npm run audit` cannot run in this sandbox: `scripts/audit.ts` drives Chrome at a hard-coded macOS path and no Chrome/Chromium is installed (nor downloadable through the network allowlist). It remains runnable on a workstation: `npm run build && npm run preview` + `npm run audit`.
- `QSentinel_Full_Project_Report.pdf` (authority #5, context-only) was never provided.

## How to run
1. PostgreSQL up; `export DATABASE_URL=postgresql+psycopg://user:pass@host:5432/qsentinel`
2. `pip install -r requirements.txt`
3. `python -m uvicorn app.main:app --port 8000` (startup creates tables, seeds the 10-row catalog and the ten pinned fixtures)
4. Frontend: `VITE_API_MODE=http VITE_API_URL=http://127.0.0.1:8000 npm run dev`
5. Tests: `python -m pytest tests/` (93). Contract smoke: `npm run smoke`, then with the server up `VITE_API_MODE=http npx tsx scripts/smoke.ts`.
