/**
 * Results (`/simulate/run/:run_id/result`) — design report, section 4.4.
 *
 * The common result interface every scenario ends on. The headline status, the
 * three metrics, the detection mechanism and the scenario-specific evidence all
 * come from GET /api/simulate/{run_id}/result — the frontend never decides
 * whether an attack was detected, and never derives a number.
 */

import { Link } from "react-router-dom";
import { api } from "../api";
import { attackLabel, type AttackEvidence, type ResultResponse } from "../api/types";
import { useApi } from "../lib/useApi";
import { mechanismLabel, pct, rate } from "../lib/formatting";
import {
  Banner,
  ComparisonBar,
  DataCard,
  EmptyState,
  Panel,
  SectionHead,
  StatusBadge,
  VerifierPanel,
} from "../components/ui/atoms";
import { SeverityGauge } from "../components/ui/SeverityGauge";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { useRunId } from "../lib/useRunId";

export function ResultsPage() {
  const runId = useRunId();
  const { data, error, loading } = useApi<ResultResponse>(
    () => api.getResult(runId),
    [runId],
  );

  const detected = data?.detectionStatus === "detected";

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
      <p className="micro text-accent-ink">Run result</p>
      <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold text-on-bg">
        Results
      </h1>
      {data && (
        <p className="mt-2 text-[14px] text-n-500">
          {attackLabel(data.attackType)} ·{" "}
          <span className="num">{data.runId}</span>
        </p>
      )}

      <div className="mt-6">
        {loading && <div className="skeleton h-40 w-full" />}
        {error && <ErrorBanner error={error} />}

        {data && (
          <div className="animate-fade-up space-y-6">
            {/* ---------------- verdict ---------------- */}
            <div
              className={`stamp ${detected ? "text-fail-ink" : "text-pass"}`}
              role="status"
            >
              <StatusBadge tone={detected ? "attack" : "honest"}>
                {detected ? "Detected" : "Not detected"}
              </StatusBadge>
              <span className="stamp-label">
                {detected
                  ? data.verdict === "rejected"
                    ? "Rejected — attack detected"
                    : "Attack detected"
                  : data.attackType === "honest"
                    ? "Accepted — consistent with an honest run"
                    : "Not detected"}
              </span>
            </div>

            {/* ---------------- metrics ---------------- */}
            <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-3 sm:grid-cols-3">
                <DataCard
                  label="Mismatch rate"
                  value={rate(data.mismatchRate)}
                  tone={detected ? "fail" : "pass"}
                  hint={`${pct(data.mismatchRate, 2)} of slots disagreed`}
                />
                <DataCard
                  label="Detection threshold"
                  value={rate(data.threshold)}
                  hint={
                    data.thresholdSource === "override"
                      ? "User override"
                      : "Derived by the backend"
                  }
                />
                {data.confidence ? (
                  <DataCard label="Confidence" value={data.confidence} />
                ) : (
                  <div className="card-muted flex flex-col justify-center p-4">
                    <p className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">
                      Confidence
                    </p>
                    <p className="mt-2 text-[14px] leading-snug text-n-500">
                      Not reported by the backend for this detection mechanism.
                    </p>
                  </div>
                )}
              </div>
              <Panel className="flex items-center justify-center p-5">
                <div className="text-center">
                  <p className="micro mb-3 text-n-500">Quantum severity score</p>
                  <SeverityGauge score={data.severityScore} />
                </div>
              </Panel>
            </div>

            {/* threshold comparison */}
            <Panel className="p-5">
              <SectionHead step="A" title="Threshold comparison">
                <span className="micro text-n-500">backend values</span>
              </SectionHead>
              <ComparisonBar
                label="Mismatch rate against the detection threshold"
                unit="mismatch rate"
                rows={[
                  {
                    name: "Mismatch rate observed",
                    value: data.mismatchRate,
                    tone: detected ? "primary" : "secondary",
                  },
                ]}
                marker={{ value: data.threshold, label: "Detection threshold" }}
                format={(v) => rate(v)}
              />
              <p className="mt-3 text-[14px] text-on-surface">
                {detected
                  ? `The observed mismatch rate is above the threshold, so the run was rejected.`
                  : `The observed mismatch rate is below the threshold, so nothing flagged this run.`}
              </p>
            </Panel>

            {/* ---------------- detection mechanism ---------------- */}
            <Panel className="p-5">
              <SectionHead
                step="B"
                title="Detection evidence"
                state={detected ? "done" : "pending"}
              >
                <span className="micro text-n-500">flagged_by</span>
              </SectionHead>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge tone={detected ? "attack" : "honest"}>
                  {mechanismLabel(data.flaggedBy)}
                </StatusBadge>
                <p className="min-w-0 flex-1 text-[15px] text-on-surface">
                  {MECHANISM_COPY[data.flaggedBy]}
                </p>
              </div>
            </Panel>

            {/* ---------------- root cause & mitigation ---------------- */}
            <Panel className="p-5">
              <SectionHead step="C" title="Root cause &amp; mitigation" state="done">
                <span className="micro text-n-500">analysis</span>
              </SectionHead>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="micro text-fail-ink">Root cause</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-on-surface">
                    {data.rootCause}
                  </p>
                </div>
                <div>
                  <p className="micro text-pass">Mitigation</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-on-surface">
                    {data.mitigation}
                  </p>
                </div>
              </div>
            </Panel>

            {/* ---------------- scenario-specific evidence ---------------- */}
            {data.attackType !== "honest" && (
              <Panel className="p-5">
                <SectionHead step="D" title="Attack evidence" state="done">
                  <span className="micro text-n-500">ground truth</span>
                </SectionHead>
                <AttackEvidenceView evidence={data.evidence} />
              </Panel>
            )}

            {/* ---------------- field-level diff ---------------- */}
            {data.flaggedDiff && data.flaggedDiff.length > 0 && (
              <Panel className="p-5">
                <SectionHead step="E" title="Field-level difference" state="done">
                  <span className="micro text-n-500">sent vs received</span>
                </SectionHead>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.flaggedDiff.map((d, i) => (
                    <div key={i} className="card-muted p-4">
                      <p className="micro text-n-500">Sent</p>
                      <p className="num mt-1 text-[13px] break-all text-on-surface">{d.sent}</p>
                      <p className="micro mt-3 text-n-500">Received</p>
                      <p className="num mt-1 text-[13px] break-all text-fail-ink">{d.received}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* ---------------- verifier outcomes ---------------- */}
            <Panel className="p-5">
              <SectionHead step="F" title="Verifier outcomes" state="done">
                <span className="micro text-n-500">
                  {data.verifiers.length} verifier{data.verifiers.length === 1 ? "" : "s"}
                </span>
              </SectionHead>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.verifiers.map((v, i) => (
                  <VerifierPanel
                    key={v.name}
                    name={v.name}
                    index={i + 1}
                    verdict={v.verdict}
                    blocks={{ failed: v.failed, total: v.total }}
                    active={data.verifiers.length > 1 && i === 0}
                  />
                ))}
              </div>
              {data.arbitrationAvailable && (
                <p className="mt-4 text-[13px] text-n-500">
                  The verifiers disagree.{" "}
                  <Link
                    to={`/simulate/run/${runId}/arbitration`}
                    className="text-accent-ink underline"
                  >
                    View arbitration
                  </Link>{" "}
                  to see the cross-check and the ruling.
                </p>
              )}
            </Panel>

            {/* ---------------- next steps ---------------- */}
            <div className="flex flex-wrap items-center gap-3">
              {data.arbitrationAvailable && (
                <Link to={`/simulate/run/${runId}/arbitration`} className="btn btn-secondary">
                  View arbitration
                </Link>
              )}
              <Link to="/simulate/new" className="btn btn-primary">
                Run another simulation
              </Link>
              <Link to="/dashboard" className="btn btn-ghost">
                Dashboard
              </Link>
            </div>

            {data.attackType === "partial" && !detected && (
              <Banner tone="warn" title="This run was not detected">
                <p>
                  A partial attack that touches only a small fraction of the
                  qubits can stay under the threshold. That is a genuine false
                  negative, not a frontend failure — the dashboard shows how the
                  detection rate varies with attack size across historical runs.
                </p>
              </Banner>
            )}

            {data.arbitrationAvailable && (
              <Banner tone="neutral" title="Why arbitration is not in the nav">
                <p>
                  Arbitration only appears from a disputed result, so the nav
                  stays uncluttered for the runs that never need it.
                </p>
              </Banner>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const MECHANISM_COPY: Record<ResultResponse["flaggedBy"], string> = {
  "quantum-error-rate":
    "The measured error rate exceeded the backend-derived threshold.",
  "classical-mac":
    "The message authentication code did not match the sender's digest.",
  "nonce-session-validation":
    "The session nonce had already been used by an earlier run.",
  "verifier-cross-check":
    "The verifiers reported incompatible verdicts for the same signature.",
  none: "No check flagged this run — it is consistent with an honest signature.",
};

/* ------------------------------------------------------------------ */
/*  Scenario-specific evidence panels                                  */
/* ------------------------------------------------------------------ */

function AttackEvidenceView({ evidence }: { evidence: AttackEvidence }) {
  const rows: { label: string; value: string }[] = [];

  if (evidence.attackFraction !== undefined) {
    rows.push({ label: "Attack fraction", value: pct(evidence.attackFraction, 0) });
  }
  if (evidence.affectedQubits !== undefined) {
    rows.push({ label: "Affected qubits", value: evidence.affectedQubits.toLocaleString() });
  }
  if (evidence.expectedMismatchRate !== undefined) {
    rows.push({ label: "Expected mismatch (noise floor)", value: rate(evidence.expectedMismatchRate) });
  }
  if (evidence.verifierDivergence !== undefined) {
    rows.push({ label: "Verifier divergence", value: rate(evidence.verifierDivergence) });
  }

  return (
    <div className="space-y-5">
      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="card-muted p-3">
              <p className="micro text-n-500">{r.label}</p>
              <p className="num mt-1 text-[18px] font-semibold text-on-surface">{r.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* basis breakdown — fixed- and random-basis intercept */}
      {evidence.basisBreakdown && (
        <ComparisonBar
          label="Basis breakdown"
          unit="mismatch rate"
          rows={[
            { name: "Z basis", value: evidence.basisBreakdown.zBasisMismatch },
            {
              name: "X basis",
              value: evidence.basisBreakdown.xBasisMismatch,
              tone: "secondary",
            },
          ]}
          format={(v) => rate(v)}
        />
      )}

      {/* replay */}
      {evidence.nonceStatus && (
        <div className="card-muted space-y-3 p-4">
          <p className="micro text-n-500">Session validation</p>
          <dl className="space-y-2">
            <Field label="Nonce status" value={evidence.nonceStatus} tone="fail" />
            {evidence.originalRunId && (
              <Field label="Original session" value={evidence.originalRunId} mono />
            )}
            <Field label="Current session" value="this run" mono />
          </dl>
        </div>
      )}

      {/* classical tampering */}
      {evidence.macStatus && (
        <div className="card-muted space-y-3 p-4">
          <p className="micro text-n-500">MAC verification</p>
          <dl className="space-y-2">
            <Field
              label="MAC status"
              value={evidence.macStatus}
              tone={evidence.macStatus === "failed" ? "fail" : "pass"}
            />
            {evidence.tamperedField && (
              <Field label="Tampered field" value={evidence.tamperedField} />
            )}
          </dl>
          <p className="text-[12px] text-n-500">
            No secret key material is shown — only the digest comparison result.
          </p>
        </div>
      )}

      {/* collusion */}
      {evidence.crossCheckStatus && (
        <div className="card-muted p-4">
          <p className="micro text-n-500">Verifier cross-check</p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge
              tone={evidence.crossCheckStatus === "diverged" ? "attack" : "honest"}
            >
              {evidence.crossCheckStatus === "diverged" ? "Diverged" : "Matched"}
            </StatusBadge>
          </div>
        </div>
      )}

      {evidence.notes && evidence.notes.length > 0 && (
        <ul className="space-y-1.5">
          {evidence.notes.map((n, i) => (
            <li key={i} className="text-[14px] leading-relaxed text-on-surface">
              {n}
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 && !evidence.basisBreakdown && !evidence.nonceStatus &&
        !evidence.macStatus && !evidence.crossCheckStatus && !evidence.notes?.length && (
        <EmptyState title="No additional evidence">
          The backend returned no ground-truth fields for this run beyond the
          metrics above.
        </EmptyState>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "pass" | "fail";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="display text-[12px] tracking-[0.04em] text-n-500 uppercase">{label}</dt>
      <dd
        className={`text-[14px] font-semibold ${
          tone === "fail" ? "text-fail-ink" : tone === "pass" ? "text-pass-ink" : "text-on-surface"
        } ${mono ? "num" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
