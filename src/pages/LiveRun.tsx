/**
 * Live Simulation (`/simulate/run/:run_id`) — design report, section 4.3.
 *
 * The animated walk-through. PhaseStepper pinned at top; below it one large
 * panel that swaps content per phase. Each phase is driven by its own endpoint
 * call rather than one giant payload, so the frontend can animate phase by
 * phase even if the backend computes the whole run instantly.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ApiError } from "../api";
import { useCountUp } from "../lib/useCountUp";
import type {
  DistributionResponse,
  KeygenResponse,
  SignResponse,
  VerifierResult,
  VerifyEvent,
} from "../api/types";
import {
  Banner,
  Icon,
  Panel,
  PhaseStepper,
  SectionHead,
  StatusBadge,
  type PhaseId,
} from "../components/ui/atoms";
import { QuantumChannel } from "../components/ui/QuantumChannel";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { useRunId } from "../App";

const toApiError = (e: unknown) =>
  e instanceof ApiError
    ? e
    : new ApiError("BACKEND_ERROR", e instanceof Error ? e.message : String(e));

const PHASE_ORDER: PhaseId[] = [
  "keygen",
  "distribution",
  "signing",
  "verification",
  "result",
];

/** How long each phase's content stays on screen before advancing. */
const PHASE_DWELL_MS = 1400;
const dwell = (ms = PHASE_DWELL_MS) => new Promise((r) => setTimeout(r, ms));

export function LiveRunPage() {
  const runId = useRunId();
  const [phase, setPhase] = useState<PhaseId>("keygen");
  const [maxReached, setMaxReached] = useState<PhaseId>("keygen");
  const [keygen, setKeygen] = useState<KeygenResponse | null>(null);
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null);
  const [signing, setSigning] = useState<SignResponse | null>(null);
  const [results, setResults] = useState<VerifierResult[] | null>(null);
  const [liveEvent, setLiveEvent] = useState<VerifyEvent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);

  const advance = useCallback((next: PhaseId) => {
    setPhase(next);
    setMaxReached((m) => {
      const mi = PHASE_ORDER.indexOf(m);
      const ni = PHASE_ORDER.indexOf(next);
      return ni > mi ? next : m;
    });
  }, []);

  /* ---- phase 1: keygen ---- */
  useEffect(() => {
    if (phase !== "keygen") return;
    let cancelled = false;
    api
      .getKeygen(runId)
      .then(async (d) => {
        if (cancelled) return;
        setKeygen(d);
        await dwell();
        if (cancelled) return;
        advance("distribution");
      })
      .catch((e) => !cancelled && setError(toApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [phase, runId, advance]);

  /* ---- phase 2: distribution ---- */
  useEffect(() => {
    if (phase !== "distribution") return;
    let cancelled = false;
    api
      .getDistribution(runId)
      .then(async (d) => {
        if (cancelled) return;
        setDistribution(d);
        await dwell();
        if (cancelled) return;
        advance("signing");
      })
      .catch((e) => !cancelled && setError(toApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [phase, runId, advance]);

  /* ---- phase 3: signing ---- */
  useEffect(() => {
    if (phase !== "signing") return;
    let cancelled = false;
    api
      .getSigning(runId)
      .then(async (d) => {
        if (cancelled) return;
        setSigning(d);
        await dwell();
        if (cancelled) return;
        advance("verification");
      })
      .catch((e) => !cancelled && setError(toApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [phase, runId, advance]);

  /* ---- phase 4: verification (streamed) ---- */
  useEffect(() => {
    if (phase !== "verification") return;
    let cancelled = false;
    setRunning(true);
    api
      .streamVerification(runId, (event) => {
        if (!cancelled) setLiveEvent(event);
      })
      .then((r) => {
        if (cancelled) return;
        setResults(r);
        setRunning(false);
        advance("result");
      })
      .catch((e) => {
        if (cancelled) return;
        setRunning(false);
        setError(toApiError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [phase, runId, advance]);

  const mismatchRate = liveEvent
    ? liveEvent.block.mismatches / liveEvent.block.slotCount
    : 0;
  const animatedMismatch = useCountUp(mismatchRate, 400);

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
      <div className="card p-5 sm:p-6">
        <PhaseStepper current={phase} maxReached={maxReached} />
      </div>

      <div className="mt-6">
        {error && <ErrorBanner error={error} />}

        {/* ------------------------- keygen ------------------------- */}
        {phase === "keygen" && (
          <Panel className="p-5">
            <SectionHead step="1" title="Key generation" state="active">
              <span className="micro text-n-500">GET /api/simulate/{runId}/keygen</span>
            </SectionHead>
            {keygen ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: "Total slots", v: keygen.totalSlots.toLocaleString() },
                  { l: "Slots / block", v: keygen.slotsPerBlock },
                  { l: "Blocks", v: keygen.blocks },
                  { l: "Bags / position", v: keygen.bagsPerPosition },
                ].map((s) => (
                  <div key={s.l} className="card-muted p-3">
                    <p className="micro text-n-500">{s.l}</p>
                    <p className="num mt-1 text-[20px] font-semibold text-on-surface">{s.v}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-20 w-full" />
              </div>
            )}
          </Panel>
        )}

        {/* ------------------------- distribution ------------------------- */}
        {phase === "distribution" && (
          <Panel className="p-5">
            <SectionHead step="2" title="Key distribution" state="active">
              <span className="micro text-n-500">GET /api/simulate/{runId}/distribution</span>
            </SectionHead>
            {distribution ? (
              <div className="space-y-3">
                {distribution.verifiers.map((v) => (
                  <div key={v.name} className="card-muted flex items-center gap-4 p-4">
                    <span className="grid size-9 place-items-center rounded-[var(--qs-r-sm)] bg-surface-2 text-n-600">
                      <Icon name="eye" size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="display text-[14px] font-semibold text-on-surface">{v.name}</p>
                      <div className="meter mt-2">
                        <div
                          className="meter-fill bg-primary"
                          style={{ width: `${(v.received / v.total) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="num text-[13px] text-n-500">
                      {v.received.toLocaleString()} / {v.total.toLocaleString()}
                    </span>
                  </div>
                ))}
                <p className="text-[13px] text-n-500">
                  Bell-pair icons connect signer → verifier; a lock icon marks each
                  classical bit sent.
                </p>
              </div>
            ) : (
              <div className="skeleton h-24 w-full" />
            )}
          </Panel>
        )}

        {/* ------------------------- signing ------------------------- */}
        {phase === "signing" && (
          <Panel className="p-5">
            <SectionHead step="3" title="Signing" state="active">
              <span className="micro text-n-500">GET /api/simulate/{runId}/signing</span>
            </SectionHead>
            {signing ? (
              <div className="space-y-4">
                <div>
                  <p className="micro text-n-500">Message</p>
                  <p className="num mt-1 rounded-[var(--qs-r-sm)] bg-surface-2 p-3 text-[14px] break-all text-on-surface">
                    {signing.message || "(empty message)"}
                  </p>
                </div>
                <div>
                  <p className="micro text-n-500">Declared signature data</p>
                  <p className="num mt-1 max-h-28 overflow-auto rounded-[var(--qs-r-sm)] bg-surface-2 p-3 text-[13px] break-all text-n-700">
                    {signing.encoded}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {signing.sentTo.map((name) => (
                    <StatusBadge key={name} tone="neutral">
                      {name}
                    </StatusBadge>
                  ))}
                </div>
                <div className="mt-5 border-t border-outline pt-4">
                  <QuantumChannel attacking={signing.intercepts} />
                </div>
              </div>
            ) : (
              <div className="skeleton h-24 w-full" />
            )}
          </Panel>
        )}

        {/* ------------------------- verification ------------------------- */}
        {phase === "verification" && (
          <Panel className="p-5">
            <SectionHead step="4" title="Verification" state="active">
              <span className="micro text-n-500">GET /api/simulate/{runId}/verification</span>
            </SectionHead>
            <div className="grid gap-6 sm:grid-cols-[1fr_240px]">
              <div>
                <p className="micro text-n-500">Live mismatch rate</p>
                <p className="num mt-1 text-[40px] leading-none font-semibold text-on-bg">
                  {animatedMismatch.toFixed(3)}
                </p>
                <div className="relative mt-4 h-2 w-full rounded-full bg-n-200">
                  <div
                    className="meter-fill rounded-full bg-fail"
                    style={{ width: `${Math.min(100, mismatchRate * 100)}%` }}
                  />
                  {/* threshold line drawn as a fixed reference */}
                  <span
                    className="absolute top-[-4px] bottom-[-4px] w-px bg-ink"
                    style={{ left: "12%" }}
                    aria-label="threshold"
                  />
                </div>
                <p className="mt-2 text-[13px] text-n-500">
                  threshold reference at 0.100 — the line is fixed, the bars move.
                </p>
              </div>
              <div className="space-y-2">
                {(results ?? []).map((r) => (
                  <div key={r.name} className="card-muted flex items-center justify-between p-3">
                    <span className="display text-[13px] font-semibold text-on-surface">
                      {r.name}
                    </span>
                    <span className="num text-[13px] text-n-500">
                      {r.checked}/{r.total}
                    </span>
                  </div>
                ))}
                {running && (
                  <p className="micro animate-pulse-soft text-primary">streaming…</p>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* ------------------------- result ------------------------- */}
        {phase === "result" && (
          <div className="space-y-4">
            <Banner tone="pass" title="Verification complete">
              <p>
                Every block was checked against the expected distribution. The
                verdict and the evidence are on the Results page.
              </p>
            </Banner>
            <Link to={`/simulate/run/${runId}/result`} className="btn btn-primary">
              View result
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
