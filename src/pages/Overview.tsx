/**
 * Overview (`/`) — design report, section 4.1.
 *
 * Landing page. One-paragraph explanation so a judge who opens the link cold
 * understands it in ten seconds, plus a way straight into the demo.
 * Two-column hero: the pitch on the live, the forgery-odds evidence beside it.
 */

import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { api } from "../api";
import type { ForgeryComparison } from "../api/types";
import { Banner, ComparisonBar, Panel, SectionHead } from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

export function OverviewPage() {
  const navigate = useNavigate();
  const { data, error, loading } = useApi<ForgeryComparison>(
    () => api.getForgeryComparison(),
    [],
  );

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
            RSA and ECC break under Shor's algorithm. This framework detects
            forgery, impersonation, replay and tampering on a teleportation-based
            Quantum Digital Signature protocol — using Pauli eigenstates,
            projective measurements and statistical thresholds, never machine
            learning.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/simulate/new")}
            >
              Start a simulation
            </button>
            <Link to="/dashboard" className="btn btn-secondary">
              View dashboard
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
                left={data.classical}
                right={data.quantum}
                leftLabel={data.classicalLabel}
                rightLabel={data.quantumLabel}
                format={(v) => (v < 0.001 ? v.toExponential(0) : v.toFixed(2))}
              />
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-12">
        <Banner tone="neutral" title="How a run works">
          <p>
            Choose an attack, watch the key pool build, the signature form and
            Eve interpose — then see the statistical verdict. Every number is
            computed by the engine, not the interface.
          </p>
        </Banner>
      </div>
    </div>
  );
}
