/**
 * Page 1 — Landing (report section 4). Teaches the sealed-envelope idea
 * before any jargon, then routes to New Simulation.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ATTACK_OPTIONS, TAMPER_OPTIONS } from "../api/types";
import { useSystem } from "../lib/useSystem";
import { STAGE_CONFIG } from "../lib/phases";
import { STAGE_COPY } from "../lib/copy";
import { GLOSSARY } from "../lib/glossary";
import { StatusBadge, Term, SectionHead, Icon } from "../components/ui/atoms";
import { TopologyCanvas } from "../components/ui/TopologyCanvas";
import type { IconName } from "../lib/iconNames";

export function OverviewPage() {
  const { params: sys } = useSystem();
  const [envStep, setEnvStep] = useState(0);
  const [limitsOpen, setLimitsOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-5 md:px-8 lg:px-10">
      {/* 1 — hero */}
      <section className="grid items-center gap-8 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          <p className="display text-[12px] tracking-[0.18em] text-accent-ink uppercase">
            PS 26141 · Quantum Digital Signatures
          </p>
          <h1 className="text-balance mt-4 text-balance text-[clamp(1.9rem,4.2vw,3rem)] leading-[1.05] font-semibold tracking-tight text-ink">
            Catch quantum-era signature attacks — and see exactly why they were caught.
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-n-600">
            QSentinel simulates a teleportation-based Quantum Digital Signature
            system and detects forgery, impersonation, replay and tampering from
            quantum measurement statistics.{" "}
            <Term term="Fingerprint">The pattern of wrong-answer rates in Z, X and Y that a given attack leaves behind.</Term>{" "}
            No AI/ML.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/simulate" className="btn btn-primary btn-lg">
              Start detecting attacks <Icon name="arrow-right" size={16} />
            </Link>
            <a href="#how-it-works" className="btn btn-ghost btn-lg">
              See how it works
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <StatusBadge tone="brand">Prototype</StatusBadge>
            <StatusBadge tone="warn">Simulation, not hardware</StatusBadge>
          </div>
        </div>
        <div className="card p-4">
          <TopologyCanvas stage="distribute" attack="forgery" subtype="random-basis" targetLink="both" />
        </div>
      </section>

      {/* 2 — the problem */}
      <section className="py-10">
        <div className="panel-head">
          <h2 className="display text-[15px] font-semibold tracking-[0.08em] uppercase">
            The problem
          </h2>
        </div>
        <h3 className="text-[22px] font-semibold tracking-tight text-ink">
          Today's digital signatures rely on hard maths. Quantum computers may break that maths.
        </h3>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card-muted p-5">
            <p className="display text-[13px] font-medium tracking-[0.06em] text-n-500 uppercase">
              Classical — RSA / ECC
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-on-surface">
              Security = "factoring / discrete logs are hard". A powerful quantum
              computer running Shor's algorithm threatens this.
            </p>
          </div>
          <div className="card-muted p-5">
            <p className="display text-[13px] font-medium tracking-[0.06em] text-pass-ink uppercase">
              Quantum signatures
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-on-surface">
              Security = physics: measuring a quantum state disturbs it, and an
              unknown state can't be perfectly copied.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[14px] text-n-500 italic">
          QSentinel explores the second approach and makes attacks visible.
        </p>
      </section>

      {/* 3 — sealed envelopes */}
      <section className="py-10" id="envelopes">
        <SectionHead step="03" title="The core idea — sealed envelopes" state="active" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              n: "1",
              title: "Alice hands out sealed envelopes first",
              body: "Each envelope is a qubit. Bob and Charlie each get their own set.",
            },
            {
              n: "2",
              title: "Later, Alice signs",
              body: "Her signature doesn't contain the envelopes — it says what each envelope should contain.",
            },
            {
              n: "3",
              title: "Verifiers check",
              body: "Bob and Charlie open the envelopes with the right question and compare. Lots of mismatches means something is wrong. Opening an envelope uses it up — it can't be reused.",
            },
          ].map((s, i) => {
            const stage = Math.max(envStep, i);
            return (
              <button
                key={s.n}
                type="button"
                className={`card-muted p-5 text-left transition-opacity ${stage > i ? "opacity-100" : "opacity-60"}`}
                onMouseEnter={() => setEnvStep(i)}
              >
                <span className="num text-accent-ink text-[20px]">{s.n}</span>
                <p className="mt-1 font-semibold text-ink">{s.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-n-600">{s.body}</p>
                {stage >= i && <span className="micro mt-3 block text-pass-ink">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-n-500">
          "Right question" = measurement <Term term="Basis (Z, X, Y)">Z, X or Y foundation</Term>. Wrong question = a random answer.
        </p>
      </section>

      {/* 4 — how it works */}
      <section className="py-10" id="how-it-works">
        <SectionHead step="04" title="How QSentinel works" state="active" />
        <ol className="mt-6 grid gap-3 md:grid-cols-2">
          {STAGE_CONFIG.map((s) => (
            <li key={s.id} className="card-muted flex gap-4 p-5">
              <span className="num text-[18px] text-accent-ink">{s.num}</span>
              <div>
                <p className="font-semibold text-ink">{s.label}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-n-600">{STAGE_COPY[s.id].plain}</p>
              </div>
            </li>
          ))}
          <li className="card-muted p-5 text-[14px] text-n-500 md:col-span-2">
            <Term term="Verifier">A party who checks the signature. There are exactly two: Bob and Charlie.</Term>{" "}
            Bob can't pass his qubits to Charlie.
          </li>
        </ol>
      </section>

      {/* 5 — attacks we detect */}
      <section className="py-10" id="attacks">
        <SectionHead step="05" title="Attacks we detect" state="active" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ATTACK_OPTIONS.filter((a) => a.id !== "no-attack").map((a) => (
            <div key={a.id} className="card-muted p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-[var(--qs-r-sm)] bg-n-200 text-ink">
                  <Icon name={a.icon as IconName} size={18} />
                </span>
                <p className="font-semibold text-ink">{a.label}</p>
                <span className="micro ml-auto text-n-500">{a.id}</span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="display uppercase text-n-500">How Eve tries</dt>
                  <dd className="text-n-600">{a.description}</dd>
                </div>
                <div>
                  <dt className="display uppercase text-n-500">How we catch it</dt>
                  <dd className="text-n-600">{a.caughtAt}</dd>
                </div>
                <div>
                  <dt className="display uppercase text-n-500">Stopped at</dt>
                  <dd className="text-n-600">{a.injectedAt === "—" ? "—" : a.hint}</dd>
                </div>
              </dl>
              {a.id === "tampering" && (
                <ul className="mt-4 grid gap-1 border-t border-outline pt-3">
                  {TAMPER_OPTIONS.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[13px] text-on-surface">
                      <Icon name={t.icon as IconName} size={14} className="text-n-500" />
                      <span className="font-medium">{t.label}</span>
                      <span className="micro ml-auto text-n-500">{t.fingerprint}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 6 — what you get after every run */}
      <section className="py-10">
        <SectionHead step="06" title="What you get after every run" state="active" />
        <div className="card-muted mt-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {[
              "Verdict",
              "Fingerprint (Z/X/Y)",
              "63-bag heatmap",
              "Bob vs Charlie",
              "Root cause",
              "Mitigation",
              "Severity 0–10",
              "Full system log",
            ].map((c) => (
              <span key={c} className="chip chip-neutral">
                <Icon name="circle-check" size={13} /> {c} <span className="micro text-n-500">Prototype</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-n-600">
            Every run ends in a Results dashboard: the verdict first, then a
            fingerprint explaining it, a heatmap of every bag, Bob vs Charlie, a
            likely root cause, recommended mitigation, a severity score and the
            full system log.
          </p>
        </div>
      </section>

      {/* 7 — why it's different */}
      <section className="py-10">
        <SectionHead step="07" title="Why it's different" state="active" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card-muted p-5">
            <p className="display text-[13px] font-medium tracking-[0.06em] text-n-500 uppercase">
              Traditional
            </p>
            <p className="num mt-2 text-[15px] text-n-600">Signature invalid.</p>
          </div>
          <div className="card-muted p-5">
            <p className="display text-[13px] font-medium tracking-[0.06em] text-pass-ink uppercase">
              QSentinel
            </p>
            <p className="num mt-2 text-[15px] text-pass-ink">
              Rejected → 12+ mismatches → fingerprint → attack pattern → affected
              bags → likely cause → recommended action → severity.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[14px] text-n-500">
          We built a QDS simulator and a statistics-driven security observability layer around it.
        </p>
      </section>

      {/* 8 — key numbers */}
      <section className="py-10">
        <SectionHead step="08" title="Key numbers" state="active" />
        <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Slots per bag", value: sys.slotsPerBag, def: `${sys.slotsPerBag} slots. Each encoded bit has a 0-bag and a 1-bag; signing opens one of them.` },
            { label: "Bags per signature", value: sys.bags, def: `One bag per encoded position of the ${sys.bags}-bit BCH code.` },
            { label: "Pass line", value: `< ${sys.passLine}`, def: `A bag passes if it has fewer than ${sys.passLine} wrong slots out of ${sys.slotsPerBag}.` },
            { label: "Fidelity gate", value: `F > ${sys.fidelityGate}`, def: `Refuses the session if F ≤ ${sys.fidelityGate}.` },
            { label: "Independent verifiers", value: sys.verifierNames.length, def: `A party who checks the signature. There are exactly ${sys.verifierNames.length}: ${sys.verifierNames.join(" and ")}.` },
            { label: "Severity", value: "0–10", def: "A 0–10 project-specific rating of an incident." },
          ].map((d) => (
            <div key={d.label} className="card-muted p-4">
              <dd className="num text-[26px] leading-none font-semibold text-ink">{d.value}</dd>
              <dt>
                <Term term={d.label}>{d.def}</Term>
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* 9 — honest limits */}
      <section className="py-10" id="limits">
        <SectionHead step="09" title="What this prototype is — and isn't" state="active" />
        <div className="card-muted mt-6">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-5"
            onClick={() => setLimitsOpen((v) => !v)}
            aria-expanded={limitsOpen}
          >
            <span className="font-semibold text-ink">Honest limits</span>
            <span className="micro text-n-500">{limitsOpen ? "Collapse" : "Expand"}</span>
          </button>
          {limitsOpen && (
            <ul className="space-y-2 border-t border-outline px-5 py-4 text-[14px] leading-relaxed text-n-600">
              <li>It is a simulation, not physical quantum hardware.</li>
              <li>The classical channel's authentication is assumed (post-quantum authentication is planned future work).</li>
              <li>The 1/3 forging bound applies to a single intercepted copy.</li>
              <li>Long documents need a digest step outside the direct quantum guarantee.</li>
              <li>Noise/hardware behaviour is modelled.</li>
              <li>Denial-of-service can be detected and logged, not necessarily prevented.</li>
            </ul>
          )}
        </div>
      </section>

      {/* 10 — roadmap */}
      <section className="py-10">
        <SectionHead step="10" title="Roadmap" state="active" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Auto-Tuner", "Adaptive thresholds"],
            ["Cross-Session Correlation", "Link repeated anomalies"],
            ["Multi-Verifier Trust Scoring", "More than two verifiers"],
            ["Machine-Checkable Evidence Certificate", "Verifiable evidence packages"],
            ["Post-Quantum Classical Authentication", "Authenticate classical channels"],
          ].map(([name, blurb]) => (
            <div key={name} className="card-muted flex items-start justify-between gap-2 p-4">
              <div>
                <p className="font-semibold text-ink">{name}</p>
                <p className="mt-1 text-[13px] text-n-600">{blurb}</p>
              </div>
              <StatusBadge tone="pending">Planned</StatusBadge>
            </div>
          ))}
        </div>
      </section>

      {/* 11 — final CTA */}
      <section className="border-t border-outline py-14 text-center">
        <h2 className="text-[24px] font-semibold tracking-tight text-ink">Ready to attack it?</h2>
        <p className="mt-2 text-[15px] text-n-600">
          Try every attack the detector is built to catch — then read the evidence.
        </p>
        <Link to="/simulate" className="btn btn-primary btn-lg mt-6">
          Start detecting attacks <Icon name="arrow-right" size={16} />
        </Link>
        <p className="micro mt-4 text-n-500 flex items-center justify-center gap-1.5">
          <Icon name="atom" size={13} /> {GLOSSARY.length} glossary terms available from the top bar
        </p>
      </section>
    </div>
  );
}