/**
 * Page 3 — Live Simulation (report section 6). Event frames arrive from the
 * backend via SSE but are buffered; this page owns playback (guided mode by
 * default, Back / Play-Pause / Next / Speed / Skip to results). The attack
 * badge is present from the first frame; skipped stages are locked, never
 * hidden.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { AttackTypeId, FidelityEvent, RunEvent, StageId, TamperingSubtype } from "../api/types";
import { ATTACK_OPTIONS, TAMPER_OPTIONS, STAGES, attackLabel, tamperingLabel } from "../api/types";
import { STAGE_CONFIG } from "../lib/phases";
import { STAGE_COPY } from "../lib/copy";
import { getRun } from "../lib/runStore";
import { useRunId } from "../lib/useRunId";
import { useSystem } from "../lib/useSystem";
import {
  StageStepper,
  Icon,
  Banner,
  Outcome,
  FidelityGauge,
  NotRun,
  StatusBadge,
  Term,
} from "../components/ui/atoms";
import { TopologyCanvas } from "../components/ui/TopologyCanvas";
import type { IconName } from "../lib/iconNames";

type Speed = 1 | 2 | 4;

/** which pipeline stage a buffered frame belongs to */
function bucketOf(ev: RunEvent): StageId {
  switch (ev.kind) {
    case "session":
    case "fidelity":
      return "fidelity";
    case "keys":
      return "keys";
    case "distribute":
      return "distribute";
    case "inject":
    case "sign":
      return "sign";
    case "ledger":
    case "verify-bag":
    case "verify-done":
      return "verify";
    case "analysis":
      return "analysis";
    case "log":
    case "done":
      return ev.kind === "done" ? "analysis" : "fidelity";
  }
}

const FRAME_MS: Partial<Record<RunEvent["kind"], number>> = {
  session: 380,
  fidelity: 520,
  keys: 260,
  distribute: 260,
  sign: 260,
  inject: 900,
  ledger: 420,
  "verify-bag": 26,
  "verify-done": 420,
  analysis: 340,
  log: 0,
  done: 0,
};

export function LiveRunPage() {
  const runId = useRunId();
  const navigate = useNavigate();
  const stored = getRun(runId);

  const [events, setEvents] = useState<RunEvent[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);

  const advanceTimer = useRef<number | null>(null);
  const speedRef = useRef<Speed>(1);
  speedRef.current = speed;
  const playingRef = useRef(false);
  playingRef.current = playing;
  const autoPlayRef = useRef(false);
  autoPlayRef.current = autoPlay;
  const eventsRef = useRef<RunEvent[]>(events);
  eventsRef.current = events;

  /* ---- stream: buffer everything, playback is owned by the page ---- */
  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setIndex(-1);
    setFinished(false);
    setStreamError(null);
    api
      .streamEvents(runId, (ev) => {
        if (!cancelled) setEvents((prev) => [...prev, ev]);
      })
      .then(() => {
        if (!cancelled) setFinished(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setStreamError(e instanceof Error ? e.message : "Connection lost");
      });
    return () => {
      cancelled = true;
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, [runId]);

  /** one-frame-per-tick engine; guidance pauses at stage changes */
  const advance = useCallback((i: number) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const evts = eventsRef.current;
    if (i >= evts.length) return;

    const ev = evts[i];
    const crossed = i > 0 && bucketOf(ev) !== bucketOf(evts[i - 1]);
    if (crossed && !autoPlayRef.current) {
      /* guided (default): pause at the new stage so the caption is read */
      setIndex(i);
      setPlaying(false);
      return;
    }

    let delay = (FRAME_MS[ev.kind] ?? 80) / speedRef.current;
    if (crossed && autoPlayRef.current) delay += 2600 / speedRef.current;

    setIndex(i);
    if (i === evts.length - 1) {
      setPlaying(false);
      return;
    }
    advanceTimer.current = window.setTimeout(() => advance(i + 1), delay);
  }, []);

  // playhead follows the play button
  useEffect(() => {
    if (playing) {
      if (index < events.length - 1) advance(index + 1);
      else if (events.length > 0) advance(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const cur: RunEvent | undefined = index >= 0 ? events[index] : undefined;
  const stage: StageId | null = cur ? bucketOf(cur) : null;

  const config = stored?.config;
  const attack = config?.attack ?? "no-attack";
  const subtype = config?.subtype ?? null;
  const targetLink = config?.targetLink ?? "both";
  const replayType = config?.replayType ?? null;

  // early-stop: impersonation & replay never reach verification
  const locked =
    attack === "impersonation" || attack === "replay"
      ? (["keys", "distribute", "sign", "verify"] as StageId[])
      : [];

  const lastLogs = useMemo(
    () =>
      events
        .slice(0, index + 1)
        .filter((e): e is Extract<RunEvent, { kind: "log" }> => e.kind === "log")
        .slice(-4),
    [events, index],
  );

  const stepper = STAGE_CONFIG.map((s) => ({
    ...s,
    state:
      stage === null
        ? ("pending" as const)
        : locked.includes(s.id)
          ? ("locked" as const)
          : STAGES.find((st) => st.id === s.id)!.num <=
              STAGES.find((st) => st.id === stage)!.num
            ? ("done" as const)
            : ("pending" as const),
  }));

  const doNext = () => {
    if (index >= events.length - 1) return;
    advance(index + 1);
  };
  const doBack = () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setPlaying(false);
    setIndex((i) => Math.max(0, i - 1));
  };
  const doSkip = () => navigate(`/results/${runId}`);

  const goResults = () => navigate(`/results/${runId}`);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Live simulation</h1>
        <span className="num text-[14px] text-n-500">session {runId}</span>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge tone="brand">{finished ? "Completed" : "Running"}</StatusBadge>
          <span className="num text-[12px] text-n-500">seed {stored?.seed ?? "—"}</span>
        </div>
      </div>

      {streamError && (
        <div className="mt-4">
          <Banner tone="fail" title="Connection lost">
            {streamError}
            <span className="ml-2 inline-flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={doSkip}>
                Jump to results
              </button>
            </span>
          </Banner>
        </div>
      )}

      <div className="mt-6">
        <StageStepper nodes={stepper} ariaLabel="Six pipeline stages" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* left — topology + stage panel */}
        <div className="space-y-4">
          <div className="card p-3">
            <TopologyCanvas
              stage={stage}
              attack={attack}
              subtype={subtype}
              targetLink={targetLink}
            />
          </div>

          {cur?.kind === "done" && finished && (
            <Banner tone="pass" title="Run finished">
              The evidence is compiled.
              <span className="ml-3 inline-flex gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={goResults}>
                  View results <Icon name="arrow-right" size={14} />
                </button>
              </span>
            </Banner>
          )}
          <LiveStagePanel cur={cur} stage={stage} attack={attack} subtype={subtype} />

          {/* playback controls */}
          <div className="card-muted flex flex-wrap items-center gap-2 p-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={doBack} disabled={index <= 0} aria-label="Back one frame">
              <Icon name="player-track-prev" size={15} />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (index >= events.length - 1) return;
                if (!playing) setPlaying(true);
                else setPlaying(false);
              }}
              disabled={events.length === 0}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Icon name="player-pause" size={15} /> : <Icon name="player-play" size={15} />}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={doNext} disabled={index >= events.length - 1}>
              Next <Icon name="player-track-next" size={15} />
            </button>
            <div className="ml-1 flex items-center gap-1 rounded-[var(--qs-r)] border border-outline-strong p-0.5">
              {([1, 2, 4] as Speed[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={`display rounded-[var(--qs-r-sm)] px-2 py-0.5 text-[12px] uppercase ${speed === s ? "bg-surface-2 text-ink" : "text-n-600"}`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-n-500">
              <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} className="accent-[var(--qs-primary)]" />
              Auto-play
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={doSkip}>
              Skip to results <Icon name="player-skip-forward" size={15} />
            </button>
          </div>

          {/* mini event stream */}
          <div className="card-muted p-4">
            <p className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">
              Live event stream
            </p>
            <ul className="mt-2 space-y-1">
              {lastLogs.length === 0 && <li className="micro text-n-500">Waiting for events…</li>}
              {lastLogs.map((l, i, arr) => (
                <li
                  key={`${l.tMs}-${i}`}
                  className={`flex items-center gap-2 text-[13px] ${i < arr.length - 1 ? "text-n-500" : "text-ink"}`}
                >
                  <span className="num text-[12px] text-n-500">{l.tMs}ms</span>
                  <Icon name={LOG_ACTOR_ICON[l.actor]} size={13} className="text-n-500" />
                  <span className="display uppercase text-[12px] text-n-500">{l.actor}</span>
                  <span className="w-full">{l.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* right — attack badge + eve knowledge */}
        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <p className="display text-[12px] tracking-[0.08em] text-fail-ink uppercase">Attack badge</p>
              <Icon name="bug" size={16} className="text-fail-ink" />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-ink">{attackLabel(attack)}</p>
            {subtype && <p className="text-[14px] text-n-600">{tamperingLabel(subtype)}</p>}
            <dl className="mt-4 space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-n-500">Target</dt>
                <dd className="num font-medium text-ink">
                  {attack === "no-attack" ? "—" : targetLink === "both" ? "Bob & Charlie" : targetLink}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-n-500">Injected</dt>
                <dd className="font-medium text-ink">{injectedBetween(attack, subtype)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-n-500">Will be caught by</dt>
                <dd className="font-medium text-ink">{caughtBy(attack, subtype)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-n-500">Replay type</dt>
                <dd className="font-medium text-ink">
                  {attack === "replay" ? (replayType === "unknown" ? "Unknown ID" : "Reuse USED") : "—"}
                </dd>
              </div>
              {subtype === "partial" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-n-500">Intensity</dt>
                  <dd className="font-medium text-ink">{config?.intensityPct}%</dd>
                </div>
              )}
            </dl>
            <p className="micro mt-4 text-n-500">
              No result spoiler — only the mechanism.
            </p>
          </div>

          <div className="card p-5">
            <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Eve knows</p>
            <ul className="mt-2 space-y-1 text-[13px] text-on-surface">
              <li>✓ Public / classical information</li>
              <li>✓ The message and signature</li>
            </ul>
            <p className="display mt-4 text-[12px] tracking-[0.08em] text-n-500 uppercase">Eve does NOT know</p>
            <ul className="mt-2 space-y-1 text-[13px] text-on-surface">
              <li>✗ Alice's private state assignments</li>
              <li>✗ The unknown quantum states</li>
            </ul>
          </div>

          {locked.length > 0 && (
            <NotRun reason="Skipped stages are locked, never hidden — the system stops before any secret material is created." />
          )}
        </aside>
      </div>
    </div>
  );
}

const LOG_ACTOR_ICON: Record<string, IconName> = {
  alice: "sparkles",
  bob: "user-check",
  charlie: "user-check",
  eve: "bug",
  system: "settings",
};

function injectedBetween(attack?: string, subtype?: TamperingSubtype | null) {
  const a = ATTACK_OPTIONS.find((x) => x.id === attack);
  if (subtype) return TAMPER_OPTIONS.find((t) => t.id === subtype)?.injectedAt ?? "—";
  return a?.injectedAt ?? "—";
}

function caughtBy(attack?: string, subtype?: TamperingSubtype | null) {
  if (subtype) return TAMPER_OPTIONS.find((t) => t.id === subtype)?.caughtAt ?? "—";
  return ATTACK_OPTIONS.find((x) => x.id === attack)?.caughtAt ?? "—";
}

/* ------------------------------------------------------------------ *
 *  Stage panels — one live readout per bucket (report 6.3)
 * ------------------------------------------------------------------ */

/** simple ruled readout for single-value session/verifier frames */
function PanelFrame({
  stage,
  title,
  mono,
  extra,
}: {
  stage: string;
  title: string;
  mono?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="card-muted p-5">
      <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">
        {stage} · {title}
      </p>
      {mono && <p className="num mt-2 text-[16px] font-semibold break-all text-ink">{mono}</p>}
      {extra && <p className="micro mt-2 text-n-500">{extra}</p>}
    </div>
  );
}

function LiveStagePanel({
  cur,
  stage,
  attack,
  subtype,
}: {
  cur: RunEvent | undefined;
  stage: StageId | null;
  attack: AttackTypeId;
  subtype: TamperingSubtype | null;
}) {
  const { params } = useSystem(); // before any conditional return — valid hook order
  if (stage === null || cur === undefined) {
    return (
      <div className="card-muted p-5">
        <p className="display text-[12px] tracking-[0.08em] uppercase text-n-500">Connecting…</p>
        <p className="mt-2 text-[14px] text-n-600">Waiting for the first event of the session.</p>
      </div>
    );
  }

  if (stage === "verify" && !["ledger", "verify-bag", "verify-done"].includes(cur.kind)) {
    return <NotRun reason="Rejected before any quantum measurement was performed." />;
  }

  switch (cur.kind) {
    case "session":
      return <PanelFrame stage="fidelity" title="Session opened" mono={cur.sessionId} extra={`seed ${cur.seed} · message ${JSON.stringify(cur.message)}`} />;
    case "fidelity": {
      const f = cur as FidelityEvent;
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Fidelity Test</p>
          <FidelityGauge value={f.F} gate={f.gate} status={f.passed ? "pass" : "fail"} />
          {attack === "impersonation" && !f.passed && (
            <Banner tone="warn" title="Impersonation caught here">
              Expected entangled resource not demonstrated; session admission failed.
            </Banner>
          )}
          <p className="mt-3 text-[14px] leading-relaxed text-n-600">{STAGE_COPY.fidelity.plain}</p>
        </div>
      );
    }
    case "keys": {
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Private key generation</p>
          <p className="mt-3 text-[14px] text-n-600">
            {params.bags} bit-pairs generated — one 0-bag and one 1-bag of{" "}
            <Term term="Slot">One quantum state inside a bag.</Term> per encoded position. Only Alice knows which
            state is in which slot. It's one-time and destroyed after this run.{" "}
            <Term term="Bag">{`${params.slotsPerBag} slots. Each encoded bit has a 0-bag and a 1-bag; signing opens one of them.`}</Term>
          </p>
        </div>
      );
    }
    case "sign":
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Signing</p>
          <p className="mt-3 text-[14px] text-n-600">
            Signed <span className="font-mono">{cur.message}</span> — BCH digest <span className="font-mono">{cur.digest}</span>.
          </p>
        </div>
      );
    case "distribute":
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Distribution · set {cur.set.toUpperCase()}</p>
          {cur.correction ? (
            <p className="mt-3 text-[14px] text-n-600">
              Correction bits <span className="font-mono">{cur.correction.sent}</span> sent,{" "}
              <span className="font-mono">{cur.correction.received}</span> received
              {cur.correction.flipped && <span className="ml-1 text-fail-ink">— flipped by Eve (correction-bit tampering)</span>}.
            </p>
          ) : (
            <p className="mt-3 text-[14px] text-n-600">
              Alice teleported her independent set {cur.set.toUpperCase()} to the verifier. The two classical correction bits don't reveal the secret.
            </p>
          )}
        </div>
      );
    case "ledger":
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Session ledger lookup</p>
          <table className="mt-3 w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-outline text-left text-[12px] text-n-500 uppercase">
                <th className="py-1 pr-2">Session</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Result</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-outline">
                <td className="num py-1.5 pr-2">{cur.queriedId}</td>
                <td className="py-1.5 pr-2">
                  <Outcome ok={cur.found && cur.status === "ACTIVE"}>
                    {cur.found ? (cur.status ?? "?") : "not found"}
                  </Outcome>
                </td>
                <td className="py-1.5 pr-2">
                  {cur.stop ? (
                    <Outcome ok={false}>{cur.found ? "REPLAY DETECTED" : "UNAUTHORIZED SESSION"}</Outcome>
                  ) : (
                    <Outcome ok>ACTIVE — proceeds</Outcome>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[14px] text-n-600">{STAGE_COPY.verify.plain}</p>
        </div>
      );
    case "verify-bag": {
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">
            {cur.verifier.toUpperCase()} · bag {cur.bagIndex + 1} of {params.bags}
          </p>
          <p className="mt-3 text-[14px] text-n-600">
            <span className="num">{cur.wrong}</span> wrong of <span className="num">{cur.checked}</span> measured
            (pass line <span className="num">&lt; {cur.passLine}</span>) →{" "}
            <Outcome ok={!cur.fail}>{cur.fail ? "FAIL" : "pass"}</Outcome>
          </p>
        </div>
      );
    }
    case "verify-done":
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">
            {cur.verifier.toUpperCase()} · verification complete
          </p>
          <p className="mt-3 text-[14px] text-n-600">
            {cur.passed} of {cur.passed + cur.failed} bags passed{" "}
            <Outcome ok={cur.verdict === "ACCEPTED"}>{cur.verdict === "ACCEPTED" ? "ACCEPTED" : "REJECTED"}</Outcome>
          </p>
          <p className="micro mt-2 text-n-500">Z {cur.rates.Z.toFixed(2)} · X {cur.rates.X.toFixed(2)} · Y {cur.rates.Y.toFixed(2)}</p>
        </div>
      );
    case "inject":
      return (
        <Banner tone="fail" title={`Eve acts now: ${attackLabel(attack)}${subtype ? ` (${tamperingLabel(subtype)})` : ""}`}>
          {injectLine(subtype, cur.slotsAttacked, cur.slotsTotal)} {cur.tamperedMessage && `Replaced with "${cur.tamperedMessage}".`}
        </Banner>
      );
    case "analysis":
      return (
        <div className="card-muted p-5">
          <p className="display text-[12px] tracking-[0.08em] text-n-500 uppercase">Analysis</p>
          <p className="mt-3 text-[14px] text-n-600">
            Step {cur.step}/6 — {cur.label}:<br />
            mismatch counts → error rates per basis → fingerprint → classification → root cause → severity.
          </p>
        </div>
      );
    case "done":
      return (
        <Banner tone="pass" title="Run reached the end">
          The evidence is compiled. Open the Results dashboard to read it.
        </Banner>
      );
    case "log":
      return null;
  }
}

function injectLine(subtype: TamperingSubtype | null, slotsAttacked: number | null, slotsTotal: number | null) {
  switch (subtype) {
    case "fixed-basis":
      return "Eve measures every intercepted qubit with the one chosen basis and re-sends new qubits.";
    case "random-basis":
      return "Eve guesses a basis for each qubit she intercepts; the basis letter flickers every slot.";
    case "partial":
      return slotsAttacked !== null
        ? `${slotsAttacked} of ${slotsTotal ?? "the"} slots per bag are attacked (red); untouched slots stay in the clear.`
        : "Attacked slots are red on the strip.";
    case "message-substitution":
      return "Eve swapped the message after signing.";
    case "correction-bit":
      return "Eve edited the teleportation correction bits (e.g. 01 → 10) on the classical link.";
    default:
      return "Eve is now active on the tapped link.";
  }
}