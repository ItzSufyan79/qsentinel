/**
 * Live Simulation (`/simulate/run/:run_id`) — design report, section 4.3.
 *
 * The animated walk-through. The PhaseStepper is pinned at the top; below it
 * one panel swaps content per phase. Each phase is driven by its own endpoint
 * call, so the frontend animates phase by phase even when the backend computes
 * the whole run instantly.
 *
 * No progress percentage is invented: the bar tracks the measured mismatch of
 * the block that just arrived, and the threshold line comes from the run's
 * backend-supplied block tolerance.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ApiError } from "../api";
import { useCountUp } from "../lib/useCountUp";
import { attackLabel, type AttackTypeId } from "../api/types";
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
} from "../components/ui/atoms";
import { QuantumChannel } from "../components/ui/QuantumChannel";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { useRunId } from "../lib/useRunId";
import { PHASE_ORDER, type PhaseId } from "../lib/phases";

const toApiError = (e: unknown) =>
  e instanceof ApiError
    ? e
    : new ApiError("BACKEND_ERROR", e instanceof Error ? e.message : String(e));

/** What each phase reports while its request is in flight. */
const PHASE_PENDING_LABEL: Record<PhaseId, string> = {
  keygen: "Generating keys…",
  distribution: "Distributing quantum states…",
  signing: "Signing message…",
  verification: "Verifying signature…",
  result: "Preparing result…",
};

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
    api
      .streamVerification(runId, (event) => {
        if (!cancelled) setLiveEvent(event);
      })
      .then((r) => {
        if (cancelled) return;
        setResults(r);
        advance("result");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toApiError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [phase, runId, advance]);

  const running = phase === "verification";
  const blockRate = liveEvent ? liveEvent.block.mismatches / liveEvent.block.slotCount : 0;
  const animatedMismatch = useCountUp(blockRate, 400);
  const attack: AttackTypeId | null = signing?.attackType ?? null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
      <div className="card p-5 sm:p-6">
        <PhaseStepper current={phase} maxReached={maxReached} />
        <p
          className="micro mt-4 animate-pulse-soft text-accent-ink"
          role="status"
          aria-live="polite"
        >
          {PHASE_PENDING_LABEL[phase]}
        </p>
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
              <span className="micro text-n-500">
                GET /api/simulate/{runId}/distribution
              </span>
            </SectionHead>
            {distribution ? (
              <div className="space-y-3">
                {distribution.verifiers.map((v, i) => (
                  <div key={v.name} className="card-muted flex items-center gap-4 p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--qs-r-sm)] bg-surface-2 text-n-600">
                      <Icon name="eye" size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="display text-[14px] font-semibold text-on-surface">
                        Verifier {i + 1} — {v.name}
                      </p>
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
                  Each verifier holds its own half of the key pool. Bell-pair
                  values and bases are generated by the backend.
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
                  <p className="micro text-n-500">Message (backend-generated)</p>
                  <p className="num mt-1 rounded-[var(--qs-r-sm)] bg-surface-2 p-3 text-[14px] break-all text-on-surface">
                    {signing.message}
                  </p>
                </div>
                <div>
                  <p className="micro text-n-500">Declared signature data</p>
                  <p className="num mt-1 max-h-28 overflow-auto rounded-[var(--qs-r-sm)] bg-surface-2 p-3 text-[13px] break-all text-n-700">
                    {signing.encoded}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {attack && (
                    <StatusBadge tone="disputed">{attackLabel(attack)}</StatusBadge>
                  )}
                  {signing.sentTo.map((name) => (
                    <StatusBadge key={name} tone="neutral">
                      {name}
                    </StatusBadge>
                  ))}
                </div>
                <div className="mt-5 border-t border-outline pt-4">
                  <QuantumChannel
                    attacking={signing.intercepts}
                    caption={
                      signing.intercepts
                        ? "An attacker interposes on the quantum channel."
                        : "The quantum channel is clean — this scenario acts on the signing or the classical side."
                    }
                  />
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
              <span className="micro text-n-500">
                GET /api/simulate/{runId}/verification
              </span>
            </SectionHead>
            <div className="grid gap-6 sm:grid-cols-[1fr_260px]">
              <div>
                <p className="micro text-n-500">
                  Live block mismatch rate
                  {liveEvent ? ` — block ${liveEvent.block.index + 1}` : ""}
                </p>
                <p className="num mt-1 text-[40px] leading-none font-semibold text-on-bg">
                  {animatedMismatch.toFixed(3)}
                </p>
                <div className="relative mt-4 h-2 w-full rounded-full bg-n-200">
                  <div
                    className="meter-fill rounded-full bg-primary"
                    style={{ width: `${Math.min(100, blockRate * 100)}%` }}
                  />
                  {liveEvent && (
                    <span
                      className="absolute top-[-4px] bottom-[-4px] w-px bg-ink"
                      style={{
                        left: `${Math.min(100, (liveEvent.block.threshold / liveEvent.block.slotCount) * 100)}%`,
                      }}
                      aria-hidden
                    />
                  )}
                </div>
                <p className="num mt-2 text-[13px] text-n-500">
                  {liveEvent
                    ? `Block tolerance ${liveEvent.block.threshold} of ${liveEvent.block.slotCount} slots — the line is the backend's, not the UI's.`
                    : "Waiting for the first block measurement…"}
                </p>
                {liveEvent && (
                  <p className="mt-2 text-[14px] text-on-surface">
                    Block {liveEvent.block.index + 1}:{" "}
                    <span className="num">{liveEvent.block.mismatches}</span> mismatched slots —{" "}
                    <span
                      className={
                        liveEvent.block.status === "fail" ? "text-fail-ink" : "text-pass-ink"
                      }
                    >
                      {liveEvent.block.status === "fail" ? "over tolerance" : "within tolerance"}
                    </span>
                    .
                  </p>
                )}
              </div>
              <div className="space-y-2">
                {(results ?? []).map((r) => (
                  <div key={r.name} className="card-muted flex items-center justify-between gap-2 p-3">
                    <span className="display text-[13px] font-semibold text-on-surface">
                      {r.name}
                    </span>
                    <span className="num text-[13px] text-n-500">
                      {r.checked}/{r.total}
                    </span>
                  </div>
                ))}
                {(!results || results.length === 0) && running && (
                  <div className="skeleton h-11 w-full" />
                )}
                {running && (
                  <p className="micro animate-pulse-soft text-accent-ink">streaming blocks…</p>
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
                Every block was checked. The verdict, the detection mechanism
                and the evidence are on the Results page.
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
