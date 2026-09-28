/**
 * Overview (`/`) — design report, section 4.1.
 *
 * Landing page. One-paragraph explanation so a judge who opens the link cold
 * understands it in ten seconds, the forgery-odds evidence, the five most
 * recent runs and links to the dashboard and the event log.
 *
 * The recent-runs panel is a list of runs, not a distribution chart: the
 * endpoints that exist do not return a per-run histogram, and nothing is
 * invented to fill the gap.
 */

import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { api } from "../api";
import type { ForgeryComparison, LogPage } from "../api/types";
import { attackLabel } from "../api/types";
import { probability, shortDate } from "../lib/formatting";
import {
  ComparisonBar,
  EmptyState,
  Icon,
  Panel,
  SectionHead,
  StatusBadge,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

export function OverviewPage() {
  const navigate = useNavigate();
  const { data, error, loading } = useApi<ForgeryComparison>(
    () => api.getForgeryComparison(),
    [],
  );
  const { data: recent } = useApi<LogPage>(() => api.getLog(1, "all"), []);
  const recentRuns = (recent?.entries ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        {/* ------------------------- pitch ------------------------- */}
        <div className="animate-fade-up">
          <p className="micro text-accent-ink">PS 26141 · Blockchain &amp; Cybersecurity</p>
          <h1 className="mt-4 font-display text-[32px] leading-[1.12] font-semibold text-on-bg">
            Quantum-inspired threat detection for digital signatures
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-n-600">
            A research simulator for a teleportation-based Quantum Digital
            Signature protocol, and for the attacks it has to withstand:
            forgery, impersonation, replay, intercept-resend, partial tampering
            and verifier collusion. Detection comes from Pauli eigenstates,
            projective measurements, nonce sessions, MACs and verifier
            cross-checks — deterministic statistics, not machine learning.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/simulate/new")}
            >
              New simulation
            </button>
            <Link to="/dashboard" className="btn btn-secondary">
              View dashboard
            </Link>
            <Link to="/log" className="btn btn-ghost">
              Event log
            </Link>
          </div>
        </div>

        {/* ------------------- forgery odds evidence ------------------- */}
        <div className="animate-fade-up">
          <SectionHead step="A" title="Classical vs. quantum forgery odds">
            <span className="micro text-n-500">GET /api/stats/forgery-comparison</span>
          </SectionHead>
          <Panel className="p-6">
            {loading && (
              <div className="space-y-3">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            )}
            {error && <ErrorBanner error={error} />}
            {data && (
              <ComparisonBar
                label="Forgery probability at equivalent security"
                unit="probability"
                rows={[
                  { name: data.classicalLabel, value: data.classical, tone: "primary" },
                  { name: data.quantumLabel, value: data.quantum, tone: "pass" },
                ]}
                format={probability}
              />
            )}
            {data && (
              <p className="mt-4 text-[14px] leading-relaxed text-n-500">
                Shor's algorithm turns the discrete-logarithm problem both RSA and
                ECC are built on into a polynomial-time task. The QDS protocol is
                an attempt at post-quantum signing: a quantum channel that a
                classical attacker cannot read, and cannot therefore forge against.
              </p>
            )}
          </Panel>
        </div>
      </div>

      {/* ------------------------- recent runs ------------------------- */}
      <div className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="animate-fade-up">
          <SectionHead step="B" title="Recent runs">
            <span className="micro text-n-500">GET /api/log</span>
          </SectionHead>
          <Panel className="p-5">
            {recentRuns.length === 0 ? (
              <EmptyState title="No runs logged yet">
                Start a simulation and it will appear here. The engine seeds a
                few historical runs so the dashboard and log are never empty.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-outline">
                {recentRuns.map((e) => (
                  <li key={e.runId}>
                    <Link
                      to={`/simulate/run/${e.runId}/result`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-2"
                    >
                      <Icon
                        name={e.detected ? "alert-triangle" : "shield-check"}
                        size={16}
                        className={e.detected ? "text-fail-ink" : "text-pass-ink"}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="display text-[14px] font-semibold text-on-surface">
                          {attackLabel(e.attackType)}
                        </p>
                        <p className="num truncate text-[12px] text-n-500">{e.runId}</p>
                      </div>
                      <StatusBadge tone={e.detected ? "attack" : "honest"}>
                        {e.detected ? "Detected" : "Not detected"}
                      </StatusBadge>
                      <span className="num hidden shrink-0 text-[12px] text-n-500 sm:block">
                        {shortDate(e.date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="animate-fade-up">
          <SectionHead step="C" title="Where to go next">
            <span className="micro text-n-500">shortcuts</span>
          </SectionHead>
          <Panel className="divide-y divide-outline p-0">
            {[
              {
                to: "/dashboard",
                icon: "chart-bar" as const,
                title: "Dashboard",
                body: "Detection rates by attack type, noise sensitivity, forensic breakdown, verifier agreement.",
              },
              {
                to: "/log",
                icon: "list-details" as const,
                title: "Event log",
                body: "Every run, its verdict and which check flagged it. Filter, then export CSV.",
              },
              {
                to: "/simulate/new",
                icon: "flask" as const,
                title: "New simulation",
                body: "Nine scenarios, from an honest baseline to a partial attack or a colluding pair of verifiers.",
              },
            ].map((q) => (
              <Link
                key={q.to}
                to={q.to}
                className="flex items-start gap-3 p-4 transition-colors hover:bg-surface-2"
              >
                <span className="mt-0.5 text-accent-ink">
                  <Icon name={q.icon} size={18} />
                </span>
                <div>
                  <p className="display text-[14px] font-semibold text-on-surface">
                    {q.title}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-n-500">{q.body}</p>
                </div>
              </Link>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
