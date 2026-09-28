/**
 * Page 4 — Results Dashboard (report section 7). Answers "was it caught, and
 * what was it?" and "why are we sure?". The verdict banner, path strip, left
 * column and Statistics / System Logs tabs all render backend-only numbers;
 * missing panels render as "Not run" cards.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type {
  AttackTypeId,
  BinomialResponse,
  ReplayType,
  ResultResponse,
  RunConfig,
  TamperingSubtype,
  TargetLink,
  VerifierReport,
} from "../api/types";
import { ApiError, attackLabel, tamperingLabel } from "../api/types";
import { useApi } from "../lib/useApi";
import { useRunId } from "../lib/useRunId";
import { getRun, saveRun } from "../lib/runStore";
import { DIAGNOSIS, diagnosisKey, HONEST } from "../lib/copy";
import { probability } from "../lib/formatting";
import {
  Banner,
  CaptionBlock,
  ComparisonBar,
  FidelityGauge,
  Icon,
  MetricCard,
  NotRun,
  Outcome,
  Panel,
  SeverityGauge,
  StatusBadge,
} from "../components/ui/atoms";
import {
  BagDistributionChart,
  DetectionCurveChart,
  FingerprintChart,
  Heatmap,
} from "../components/ui/charts";
import { LogTable } from "../components/ui/LogTable";
import type { IconName } from "../lib/iconNames";

const CAP = {
  fidelity: {
    what: "How genuine the quantum link between Alice and each verifier is, scored 0 to 1.",
    how: "Above the 0.5 line = entanglement demonstrated. Below it, the session is refused. 0.25 is what a link with no entanglement looks like.",
  },
  ledger: {
    what: "The session ledger check that runs before any quantum measurement.",
    how: "ACTIVE proceeds. USED = replay. Not found = unauthorized.",
  },
  bagdist: {
    what: "How many wrong slots to expect per 128-slot bag. Honest signers get a handful; cheaters get about a third.",
    how: "Curves that barely overlap = an easy decision. The vertical line at 12 is the pass line. Each dot is a bag from this run.",
  },
  fingerprint: {
    what: "For each measurement basis (Z, X, Y), the fraction of wrong answers. Different attacks leave different patterns, like fingerprints.",
    how: "Bars = this run. Ghost marks = the closest known attack pattern.",
  },
  heatmap: {
    what: "Each square is one bag of the signature, colored by how many of its slots were wrong.",
    how: "Teal = clean. Red with an x = failed (12 or more wrong). Hover or focus for details.",
  },
  bvc: {
    what: "Two independent verifiers checking the same signature with their own quantum material.",
    how: "Agreement is reassuring; disagreement is itself a clue.",
  },
  detection: {
    what: "How likely the attack is to be caught at each strength.",
    how: "Dashed = a single bag. Solid = the whole 63-bag signature (all bags must pass), which catches much more.",
  },
  severity: {
    what: "A 0–10 score for how serious this incident is.",
    how: "Three inputs are combined: how sure we are of the pattern, how far past the pass line the mismatches went, and the attack category.",
  },
  rootcause: {
    what: "The most likely explanation for the pattern we saw.",
    how: "It's an inference from statistics, not proof of who did it.",
  },
  attackconfig: {
    what: "Everything Eve did in this run, so the result is reproducible.",
    how: "Read-only; shown with the seed that re-creates the run.",
  },
} as const;

/** a measured verifier prefers the one the fingerprint came from */
function measuredVerifier(env: ResultResponse["verdictBanner"]): "bob" | "charlie" {
  return env.verifiers.bob.rates ? "bob" : "charlie";
}

function passLineOf(env: ResultResponse["verdictBanner"]): number {
  return env.bagDistribution?.passLine ?? 12;
}

export function ResultsPage() {
  const navigate = useNavigate();
  const runId = useRunId();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "statistics";

  const { data, error, loading } = useApi(() => api.getResult(runId), [runId]);

  const [bagDist, setBagDist] = useState<BinomialResponse | null>(null);
  const [binErr, setBinErr] = useState<string | null>(null);
  const [binView, setBinView] = useState<"bob" | "charlie">("bob");
  const [heatView, setHeatView] = useState<"bob" | "charlie">("bob");

  const loadBinomial = useCallback(
    (bd: NonNullable<ResultResponse["verdictBanner"]["bagDistribution"]>) => {
      api
        .getBinomial(bd.n, bd.pHonest, bd.pCheat)
        .then((r) => {
          setBinErr(null);
          setBagDist(r);
        })
        .catch((e: unknown) => setBinErr(e instanceof Error ? e.message : "Binomial unavailable"));
    },
    [],
  );

  useEffect(() => {
    if (!data) return;
    const bd = data.verdictBanner.bagDistribution;
    if (!bd) return;
    void loadBinomial(bd);
  }, [data, loadBinomial]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 lg:px-10">
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-[var(--qs-r)] bg-n-200" />
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="h-80 animate-pulse rounded-[var(--qs-r)] bg-n-200" />
            <div className="h-96 animate-pulse rounded-[var(--qs-r)] bg-n-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.code === "RUN_NOT_FOUND";
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center md:px-8">
        <div className="card-muted p-8">
          <p className="display text-[13px] tracking-[0.1em] text-fail-ink uppercase">Unable to load dashboard</p>
          <h1 className="mt-3 text-[22px] font-semibold text-ink">
            {notFound ? "Session not found" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-n-600">
            {notFound
              ? "This session ID isn't in the store — it may have been cleared by a restart, or the link is wrong."
              : error.message}
          </p>
          <Link to="/simulate" className="btn btn-primary mt-6">
            Start a new simulation <Icon name="arrow-right" size={15} />
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const res = data;
  const env = res.verdictBanner;
  const config = env.attackConfig;
  const diag = DIAGNOSIS[diagnosisKey(config.attack, config.subtype)] ?? DIAGNOSIS["no-attack"];
  const v = env.verifiers;
  const used = measuredVerifier(env);
  const passLine = passLineOf(env);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 lg:px-10">
      {/* A — verdict banner */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-6">
          <div className="min-w-[260px]">
            <div className={`flex items-center gap-3 ${res.verdict === "ACCEPTED" ? "text-pass-ink" : "text-fail-ink"}`}>
              <Icon name={res.verdict === "ACCEPTED" ? "circle-check" : "circle-x"} size={34} />
              <h1 className="display text-[34px] leading-none font-semibold tracking-[0.08em]">
                {res.verdict}
              </h1>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{res.classification}</p>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-n-600">{res.story}</p>
          </div>

          <div className="flex min-w-[170px] flex-col gap-2">
            <p className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">Verifiers</p>
            {(["bob", "charlie"] as const).map((name) => (
              <span key={name} className="flex items-center gap-2">
                <span className="display w-14 text-[12px] uppercase text-n-600">{name}</span>
                <VerdictChip verdict={v[name].verdict} />
              </span>
            ))}
          </div>

          <div className="ml-auto flex flex-col items-start gap-4 md:items-end">
            <SeverityGauge score={env.severity.score} />
            <MetricCard
              label="Confidence"
              value={Math.round(res.confidence * 100)}
              unit="%"
              tone={res.verdict === "ACCEPTED" ? "pass" : "brand"}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-outline px-6 py-3">
          <span className="num text-[12px] text-n-500">session {res.sessionId} · seed {res.seed}</span>
          <span className="micro text-n-500">·</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runAgain(res, navigate)}>
            <Icon name="repeat" size={14} /> Run again
          </button>
          <Link to="/simulate" className="btn btn-ghost btn-sm">
            Try another attack
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void honestBaseline(res, navigate)}>
            <Icon name="shield-check" size={14} /> Run honest baseline
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadEvidence(res, runId)}>
            <Icon name="download" size={14} /> Evidence report
          </button>
        </div>
        <CaptionBlock
          what="This is the final decision. Everything below explains how we reached it."
          how="Read the path strip for where the attack happened, then the left column for the cause, then the statistics for the evidence."
          run={null}
        />
      </section>

      {/* B — attack path strip */}
      <StagePathStrip
        injectedAt={res.injectedAt}
        stoppedAt={res.stoppedAt}
        injectedLabel={config.injectedBetween}
        caughtLabel={config.caughtBy}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* C — left column */}
        <aside className="space-y-4">
          <Panel className="p-5">
            <LeftCardTitle icon="alert-triangle" label="Root cause" />
            <p className="mt-2 text-[15px] font-medium text-ink">{diag.cause}</p>
            <CaptionBlock what={CAP.rootcause.what} how={CAP.rootcause.how} run={null} more={HONEST.rootCause} />
          </Panel>

          <Panel className="p-5">
            <LeftCardTitle icon="tools" label="Recommended mitigation" />
            <ul className="mt-2 space-y-1.5 text-[14px] text-on-surface">
              {diag.mitigation.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <span className="mt-1 inline-block size-1.5 rounded-full bg-primary" /> {m}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-5">
            <LeftCardTitle icon="list-details" label="Why we think this" />
            <ol className="mt-2 space-y-3">
              {env.why.map((w, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num grid size-6 shrink-0 place-items-center rounded-full border text-[12px] text-accent-ink" style={{ borderColor: "var(--qs-primary)" }}>
                    {i + 1}
                  </span>
                  <a href={`#card-${w.chart}`} className="block text-[14px] leading-relaxed text-on-surface hover:text-ink">
                    <span className="font-semibold text-ink">{w.label}.</span> {w.detail}{" "}
                    <span className="text-n-500 underline decoration-dotted underline-offset-2">see chart</span>
                  </a>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel className="p-5">
            <LeftCardTitle icon="bug" label="Attack configuration" />
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {attackRows(res).map(([k, val]) => (
                <FragmentRow key={k} k={k} val={val} />
              ))}
            </dl>
            <CaptionBlock what={CAP.attackconfig.what} how={CAP.attackconfig.how} run={null} />
          </Panel>
        </aside>

        {/* D — main area */}
        <div className="min-w-0 space-y-4">
          <div className="flex justify-end">
            <div className="flex rounded-[var(--qs-r)] border border-outline-strong p-0.5" role="tablist" aria-label="Dashboard sections">
              {(
                [
                  ["statistics", "Statistics"],
                  ["logs", "System Logs"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  type="button"
                  onClick={() => setParams({ tab: value })}
                  className={`display rounded-[var(--qs-r-sm)] px-3 py-1.5 text-[12px] tracking-[0.05em] uppercase ${tab === value ? "bg-primary text-on-primary" : "text-n-600 hover:text-on-bg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === "logs" ? (
            <div className="card p-4">
              <CaptionBlock
                what="A time-ordered record of everything the system and the attacker did in this run. Use 'Follow the attack' to see only what matters."
                how="Filter by stage, actor, level, or search; expand a row to see its raw payload."
                run={null}
              />
              <div className="mt-3">
                <LogTable runId={runId} />
              </div>
            </div>
          ) : (
            <StatisticsGrid
              res={res}
              v={v}
              bagDist={bagDist}
              binErr={binErr}
              passLine={passLine}
              used={used}
              binView={binView}
              setBinView={setBinView}
              heatView={heatView}
              setHeatView={setHeatView}
              onRetryBin={() => {
                const bd = res.verdictBanner.bagDistribution;
                if (bd) void loadBinomial(bd);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  A / B helpers
 * ------------------------------------------------------------------ */

function VerdictChip({ verdict }: { verdict: VerifierReport["verdict"] }) {
  if (verdict === "NOT RUN") return <Outcome ok={false}>Not run</Outcome>;
  return <Outcome ok={verdict === "ACCEPTED"}>{verdict}</Outcome>;
}

function LeftCardTitle({ icon, label }: { icon: IconName; label: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] font-medium tracking-[0.05em] text-on-surface uppercase">
      <Icon name={icon} size={15} className="text-accent-ink" /> {label}
    </p>
  );
}

function FragmentRow({ k, val }: { k: string; val: string }) {
  return (
    <>
      <dt className="text-n-500">{k}</dt>
      <dd className="text-right font-medium text-ink">{val}</dd>
    </>
  );
}

function attackRows(res: ResultResponse): [string, string][] {
  const c = res.verdictBanner.attackConfig;
  return [
    ["Attack", attackLabel(c.attack as AttackTypeId)],
    ["Sub-type", c.subtype ? tamperingLabel(c.subtype as TamperingSubtype) : "—"],
    ["Target link", c.targetLink === "both" ? "Bob & Charlie" : c.targetLink ?? "—"],
    ["Basis (fixed)", c.basis ?? "—"],
    ["Intensity", c.intensityPct !== null ? `${c.intensityPct}%` : "—"],
    ["Slots attacked", c.slotsAttacked !== null ? `${c.slotsAttacked} of ${c.slotsTotal}` : "—"],
    ["Tampered message", c.tamperedMessage ?? "—"],
    ["Correction-bit", c.correctionMutation ?? "—"],
    ["Replay type", c.replayType ?? "—"],
    ["Injected", c.injectedBetween],
    ["Caught by", c.caughtBy],
    ["Seed", String(res.seed)],
  ];
}

function StagePathStrip({
  injectedAt,
  stoppedAt,
  injectedLabel,
  caughtLabel,
}: {
  injectedAt: string | null;
  stoppedAt: string | null;
  injectedLabel: string;
  caughtLabel: string;
}) {
  const stages = [
    { id: "fidelity", label: "Session & Fidelity" },
    { id: "keys", label: "Private keys" },
    { id: "distribute", label: "Distribution" },
    { id: "sign", label: "Signing" },
    { id: "verify", label: "Verification" },
    { id: "analysis", label: "Analysis" },
  ] as const;
  const inj = injectedAt ? stages.findIndex((s) => s.id === injectedAt) : -1;
  const stop = stoppedAt ? stages.findIndex((s) => s.id === stoppedAt) : -1;

  return (
    <section className="card-muted mt-4 p-4">
      <p className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">Attack path</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {stages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span
              className={`grid size-8 place-items-center rounded-full border text-[13px] ${
                i === inj
                  ? "border-fail bg-fail-tint text-fail-ink"
                  : i === stop
                    ? "border-fail bg-fail text-on-pass"
                    : "border-outline-strong bg-surface text-n-600"
              }`}
              title={`${s.label}${i === inj ? " — injected" : i === stop ? " — caught" : ""}`}
            >
              {i === inj ? <Icon name="bug" size={14} /> : i === stop ? <Icon name="shield-check" size={14} /> : s.label.slice(0, 2)}
            </span>
            {i < stages.length - 1 && <span className="h-px w-3 bg-outline-strong" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-on-surface">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="bug" size={13} className="text-fail-ink" /> Injected: {injectedLabel}
        </span>
        <span className="mx-2">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="shield-check" size={13} className="text-fail-ink" /> Caught: {caughtLabel}
        </span>
      </p>
      <CaptionBlock
        what="Where the attack happened and where the system caught it."
        how="The bug pin is where Eve acted; the shield pin is where the evidence ended the run."
        run={null}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 *  D — Statistics grid
 * ------------------------------------------------------------------ */

function StatisticsGrid({
  res,
  v,
  bagDist,
  binErr,
  passLine,
  used,
  binView,
  setBinView,
  heatView,
  setHeatView,
  onRetryBin,
}: {
  res: ResultResponse;
  v: ResultResponse["verdictBanner"]["verifiers"];
  bagDist: BinomialResponse | null;
  binErr: string | null;
  passLine: number;
  used: "bob" | "charlie";
  binView: "bob" | "charlie";
  setBinView: (x: "bob" | "charlie") => void;
  heatView: "bob" | "charlie";
  setHeatView: (x: "bob" | "charlie") => void;
  onRetryBin: () => void;
}) {
  const env = res.verdictBanner;
  const active = env.fidelityTest;
  const anyRun = v.bob.verdict !== "NOT RUN" || v.charlie.verdict !== "NOT RUN";
  const binDots = (name: "bob" | "charlie") => v[name].bagsWrong ?? [];

  return (
    <div className="space-y-4">
      {/* 1 — Fidelity Test */}
      <section id="card-fidelity" className="card p-5">
        <CardTitle label="Fidelity Test" chip={active ? <Outcome ok={active.passed}>{active.passed ? "PASSED" : "FAILED"}</Outcome> : null} />
        {active ? (
          <>
            <FidelityGauge value={active.F} gate={active.gate} status={active.passed ? "pass" : "fail"} />
            {env.attackConfig.attack === "impersonation" && (
              <Banner tone="warn" title="Impersonation — session admission failed">
                {HONEST.impersonation}
              </Banner>
            )}
            <CaptionBlock
              what={CAP.fidelity.what}
              how={CAP.fidelity.how}
              run={`F = ${active.F.toFixed(2)} → ${active.passed ? "PASSED" : "FAILED"}.`}
              more={HONEST.errorCalibration}
            />
          </>
        ) : (
          <NotRun />
        )}
      </section>

      {/* 2 — Ledger evidence (replay only) */}
      {env.ledger && (
        <section id="card-ledger" className="card p-5">
          <CardTitle
            label="Ledger evidence"
            chip={<StatusBadge tone={env.ledger.found && env.ledger.status === "ACTIVE" ? "honest" : "attack"}>{env.ledger.found ? "replay" : "unknown"}</StatusBadge>}
          />
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {(
                [
                  ["Queried session", env.ledger.queriedId],
                  ["Found in ledger", env.ledger.found ? "yes" : "no"],
                  ["Status", env.ledger.status ?? "—"],
                  ["Result", env.ledger.reason],
                ] as [string, string][]
              ).map(([k, val]) => (
                <tr key={k} className="border-b border-outline last:border-0">
                  <td className="py-1.5 pr-3 text-n-500">{k}</td>
                  <td className="font-mono py-1.5 text-right">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <CaptionBlock
            what={CAP.ledger.what}
            how={CAP.ledger.how}
            run={`Session ${env.ledger.queriedId} is ${env.ledger.status ?? "not found"} → ${env.ledger.found ? "REPLAY DETECTED" : "UNAUTHORIZED SESSION"}. No quantum measurement was used.`}
          />
        </section>
      )}

      {/* 3 — Bag distribution */}
      {anyRun && (
        <section id="card-bagdist" className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle label="Bag distribution: honest vs cheater" chip={<VerifierToggle label="show" v={v} value={binView} onChange={setBinView} />} />
          </div>
          {bagDist ? (
            <div className="mt-3">
              <BagDistributionChart binom={bagDist} dots={binDots(binView)} passLine={passLine} runN={bagDist.n} />
              <p className="micro mt-3 text-n-500">
                Callout numbers for this run: false rejection ≈ {probability(bagDist.falseRejection)}, false
                acceptance ≈ {probability(bagDist.falseAcceptance)} —{" "}
                <span className="italic">{HONEST.errorCalibration}.</span>
              </p>
            </div>
          ) : binErr ? (
            <p className="mt-3 text-[13px] text-fail-ink">
              {binErr}{" "}
              <button type="button" className="underline" onClick={onRetryBin}>retry</button>
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-n-500">Computing exact binomial…</p>
          )}
          <CaptionBlock
            what={CAP.bagdist.what}
            how={CAP.bagdist.how}
            run={`${binView}: ${63 - binDots(binView).filter((w) => w >= passLine).length} of 63 bags passed; worst bag had ${Math.max(0, ...binDots(binView))} wrong.`}
            more="The honest and cheater curves are the exact Binomial(128, 0.02) and Binomial(128, 0.5) distributions — honest signers get a handful of wrong slots, cheaters about a third."
          />
        </section>
      )}

      {/* 4 — fingerprint */}
      {env.fingerprintMatch && (
        <section id="card-fingerprint" className="card p-5">
          <CardTitle
            label="Z/X/Y fingerprint"
            chip={res.verdict === "ACCEPTED" ? <Outcome ok>honest pattern</Outcome> : <Outcome ok={false}>{env.fingerprintMatch.bestLabel}</Outcome>}
          />
          <div className="mt-3">
            <FingerprintChart rates={v[used].rates ?? { Z: 0, X: 0, Y: 0 }} match={env.fingerprintMatch} />
          </div>
          <CaptionBlock
            what={CAP.fingerprint.what}
            how={CAP.fingerprint.how}
            run={`Observed (${v[used].rates?.Z.toFixed(2)}, ${v[used].rates?.X.toFixed(2)}, ${v[used].rates?.Y.toFixed(2)}) is closest to ${env.fingerprintMatch.bestLabel} (distance ${env.fingerprintMatch.distance.toFixed(3)}); runner-up ${env.fingerprintMatch.runnerUpLabel} (${env.fingerprintMatch.runnerUpDistance.toFixed(3)}).`}
            more="Fingerprints come from a fixed library of known patterns (blind guessing, random-basis, fixed-basis, correction-bit, honest noise) — nothing is guessed by an AI."
          />
        </section>
      )}

      {/* 5 — heatmap */}
      {anyRun && (
        <section id="card-heatmap" className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle label="63-bag heatmap" chip={<VerifierToggle label="show" v={v} value={heatView} onChange={setHeatView} />} />
          </div>
          <div className="mt-3">
            <Heatmap
              bags={binDots(heatView)}
              passLine={passLine}
              changed={env.bchDiff?.changed ?? null}
              label={heatView === "bob" ? "Bob" : "Charlie"}
            />
          </div>
          <CaptionBlock
            what={CAP.heatmap.what}
            how={CAP.heatmap.how}
            run={`${binDots(heatView).filter((w) => w >= passLine).length} of 63 bags failed${env.bchDiff ? ", concentrated at the changed positions" : ""}.`}
          />
        </section>
      )}

      {/* 6 — Bob vs Charlie */}
      {env.agreement && (
        <section id="card-bvc" className="card p-5">
          <CardTitle label="Bob vs Charlie" chip={<StatusBadge tone={env.agreement.consistent ? "honest" : "warn"}>{env.agreement.consistent ? "consistent" : "disagree"}</StatusBadge>} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["bob", "charlie"] as const).map((name) => {
              const r = v[name];
              return (
                <div key={name} className="card-muted p-4">
                  <div className="flex items-center justify-between">
                    <p className="display text-[12px] uppercase text-n-500">{name}</p>
                    <VerdictChip verdict={r.verdict} />
                  </div>
                  <dl className="mt-3 space-y-1 text-[13px]">
                    <Row k="Bags passed" val={`${r.passed} of 63`} />
                    <Row k="Bags failed" val={`${r.failed}`} />
                    <Row k="Worst bag" val={r.worstBag ? `#${r.worstBag.index + 1} (${r.worstBag.wrong} wrong)` : "—"} />
                    <Row k="Z / X / Y" val={r.rates ? `${r.rates.Z.toFixed(2)} / ${r.rates.X.toFixed(2)} / ${r.rates.Y.toFixed(2)}` : "—"} />
                  </dl>
                </div>
              );
            })}
          </div>
          <p className={`mt-3 text-[14px] ${env.agreement.consistent ? "text-pass-ink" : "text-warn"}`}>{env.agreement.reason}</p>
          <CaptionBlock
            what={CAP.bvc.what}
            how={CAP.bvc.how}
            run={`Bob: ${v.bob.verdict}. Charlie: ${v.charlie.verdict}. Agreement: ${env.agreement.consistent ? "yes" : "no"}.`}
          />
        </section>
      )}

      {/* 7 — detection vs intensity (partial only) */}
      {env.detectionCurve && (
        <section id="card-detection" className="card p-5">
          <CardTitle label="Detection vs intensity" chip={<StatusBadge tone="brand">Partial / stealth</StatusBadge>} />
          <div className="mt-3">
            <DetectionCurveChart curve={env.detectionCurve} />
          </div>
          <CaptionBlock
            what={CAP.detection.what}
            how={CAP.detection.how}
            run={`At ${env.detectionCurve.intensities[env.detectionCurve.chosenIndex]}%: per-bag ${probability(env.detectionCurve.perBagAt)}, whole signature ${probability(env.detectionCurve.signatureAt)}.`}
          />
        </section>
      )}

      {/* 8 — severity breakdown */}
      <section id="card-severity" className="card p-5">
        <CardTitle label="Severity breakdown" chip={<span className="num text-[15px] font-semibold text-ink">{env.severity.score}/10</span>} />
        <div className="mt-3">
          <ComparisonBar
            label="How the score is built"
            rows={[
              { name: "Fingerprint confidence", value: env.severity.confidencePart, tone: "primary", format: (x) => `${x}/10` },
              { name: "Deviation past the pass line", value: env.severity.deviationPart, tone: "pass", format: (x) => `${x}/10` },
              { name: "Attack category", value: env.severity.categoryPart, tone: "secondary", format: (x) => `${x}/10` },
            ]}
          />
        </div>
        <CaptionBlock
          what={CAP.severity.what}
          how={CAP.severity.how}
          run={`${env.severity.score}/10 = confidence ${env.severity.confidencePart}, deviation ${env.severity.deviationPart}, category ${env.severity.categoryPart}.`}
          more="Project-specific score inspired by the idea of CVSS; not an official CVSS score."
        />
      </section>

      {/* 9 — attack-specific evidence */}
      {env.correctionBits && (
        <section className="card p-5">
          <CardTitle label="Correction-bit evidence" chip={<StatusBadge tone="brand">Correction-bit</StatusBadge>} />
          <p className="num mt-3 text-[14px]">
            Alice sent <Chip>{env.correctionBits.sent}</Chip> → the verifier received <Chip>{env.correctionBits.received}</Chip>
          </p>
          <p className="mt-2 text-[13px] text-n-600">Convention: {env.correctionBits.convention}</p>
        </section>
      )}
      {env.bchDiff && (
        <section className="card p-5">
          <CardTitle label="Message substitution" chip={<StatusBadge tone="brand">Substitution</StatusBadge>} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="card-muted p-4">
              <p className="display text-[12px] uppercase text-n-500">Original</p>
              <p className="font-mono mt-1 text-ink">{res.message}</p>
            </div>
            <div className="card-muted p-4">
              <p className="display text-[12px] uppercase text-fail-ink">Tampered</p>
              <p className="font-mono mt-1 text-warn">{env.attackConfig.tamperedMessage ?? "—"}</p>
            </div>
          </div>
          <p className="micro mt-3 text-n-500">
            {HONEST.bchAtLeast} This run changed {env.bchDiff.k} of 63 positions.
          </p>
        </section>
      )}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="chip chip-neutral font-mono">{children}</span>;
}

function Row({ k, val }: { k: string; val: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-n-500">{k}</dt>
      <dd className="num text-right">{val}</dd>
    </div>
  );
}

function CardTitle({ label, chip }: { label: string; chip: ReactNode }) {
  return (
    <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
      <p className="display text-[15px] font-semibold tracking-[0.06em] text-ink uppercase">{label}</p>
      {chip}
    </div>
  );
}

function VerifierToggle({
  label,
  v,
  value,
  onChange,
}: {
  label: string;
  v: ResultResponse["verdictBanner"]["verifiers"];
  value: "bob" | "charlie";
  onChange: (x: "bob" | "charlie") => void;
}) {
  const opts = [
    { id: "bob" as const, live: v.bob.verdict !== "NOT RUN" },
    { id: "charlie" as const, live: v.charlie.verdict !== "NOT RUN" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      <span className="display text-[12px] text-n-500 uppercase">{label}</span>
      <div className="flex rounded-[var(--qs-r)] border border-outline-strong p-0.5">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={!o.live}
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={`display rounded-[var(--qs-r-sm)] px-2.5 py-1 text-[12px] capitalize ${value === o.id ? "bg-primary text-on-primary" : "text-n-600 hover:text-on-bg"}`}
          >
            {o.id}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Actions
 * ------------------------------------------------------------------ */

async function runAgain(res: ResultResponse, navigate: ReturnType<typeof useNavigate>) {
  const stored = getRun(res.sessionId);
  const config: RunConfig =
    stored?.config ?? reconstructConfig(res.verdictBanner.attackConfig, res.message);
  try {
    const r = await api.rerun(res.sessionId);
    saveRun({ sessionId: r.session_id, seed: r.seed, config, createdAt: new Date().toISOString() });
    navigate(`/run/${r.session_id}`);
  } catch {
    navigate("/simulate");
  }
}

async function honestBaseline(res: ResultResponse, navigate: ReturnType<typeof useNavigate>) {
  const message = getRun(res.sessionId)?.config.message ?? res.message;
  const config: RunConfig = {
    attack: "no-attack",
    subtype: null,
    message,
    tamperedMessage: null,
    targetLink: null,
    fixedBasis: null,
    intensityPct: null,
    replayType: null,
  };
  try {
    const r = await api.createRun(config);
    saveRun({ sessionId: r.session_id, seed: r.seed, config, createdAt: new Date().toISOString() });
    navigate(`/run/${r.session_id}`);
  } catch {
    navigate("/simulate");
  }
}

function reconstructConfig(
  c: ResultResponse["verdictBanner"]["attackConfig"],
  message: string,
): RunConfig {
  return {
    attack: (c.attack ?? "no-attack") as AttackTypeId,
    subtype: (c.subtype ?? null) as TamperingSubtype | null,
    message: message || "TRANSFER 1000",
    tamperedMessage: c.tamperedMessage,
    targetLink: c.targetLink as TargetLink | null,
    fixedBasis: (c.basis ?? null) as "Z" | "X" | "Y" | null,
    intensityPct: c.intensityPct,
    replayType: (c.replayType ?? null) as ReplayType | null,
  };
}

function downloadEvidence(res: ResultResponse, runId: string) {
  void (async () => {
    let logs: unknown = [];
    try {
      logs = await api.getLogs(runId, { stage: "all", actor: "all", level: "all" });
    } catch {
      logs = { error: "logs unavailable" };
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            sessionId: res.sessionId,
            seed: res.seed,
            verdict: res.verdict,
            classification: res.classification,
            confidence: res.confidence,
            evidence: res.verdictBanner,
            logs,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qsentinel-evidence-${res.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  })();
}