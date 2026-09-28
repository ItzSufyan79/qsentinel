/**
 * Page 2 — New Simulation (report section 5). Three steps on one page with
 * progressive disclosure: choose an attack → configure only what that attack
 * needs → review & run. Eve-knowledge panel and locked system parameters are
 * always visible once an attack is chosen.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ATTACK_OPTIONS,
  TAMPER_OPTIONS,
  type AttackTypeId,
  type ReplayType,
  type RunConfig,
  type TamperingSubtype,
  type TargetLink,
} from "../api/types";
import { SYSTEM_PARAMS, api } from "../api";
import { SectionHead, Banner, Field, LockChip, Term, Icon, StatusBadge } from "../components/ui/atoms";
import { saveRun } from "../lib/runStore";
import type { IconName } from "../lib/iconNames";

const LINKS: { id: TargetLink; label: string }[] = [
  { id: "bob", label: "Bob" },
  { id: "charlie", label: "Charlie" },
  { id: "both", label: "Both" },
];

const BASES = ["Z", "X", "Y"] as const;

const REPLAY_TYPES: { id: ReplayType; label: string; note: string }[] = [
  {
    id: "used",
    label: "Reuse a USED session",
    note: "The session exists but was already verified, so it's a replay.",
  },
  {
    id: "unknown",
    label: "Unknown session ID",
    note: "The session ID isn't in the ledger, so it's an unauthorized session.",
  },
];

/** which attacks take a target-link control (report 5.3) */
const NEEDS_TARGET: AttackTypeId[] = ["forgery", "tampering"];
const NEEDS_TARGET_SUBTYPES: TamperingSubtype[] = [
  "fixed-basis",
  "random-basis",
  "partial",
  "message-substitution",
  "correction-bit",
];

export function NewSimulationPage() {
  const navigate = useNavigate();

  const [attack, setAttack] = useState<AttackTypeId | null>(null);
  const [subtype, setSubtype] = useState<TamperingSubtype | null>(null);
  const [message, setMessage] = useState("TRANSFER 1000");
  const [tamperedMessage, setTamperedMessage] = useState("");
  const [targetLink, setTargetLink] = useState<TargetLink | null>(null);
  const [fixedBasis, setFixedBasis] = useState<(typeof BASES)[number]>("Z");
  const [intensity, setIntensity] = useState(25);
  const [replayType, setReplayType] = useState<ReplayType | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = ATTACK_OPTIONS.find((a) => a.id === attack) ?? null;
  const selectedSub = TAMPER_OPTIONS.find((t) => t.id === subtype) ?? null;

  const needsTarget =
    attack === "tampering"
      ? subtype !== null && NEEDS_TARGET_SUBTYPES.includes(subtype)
      : attack !== null && NEEDS_TARGET.includes(attack);

  const showMessage = attack === "no-attack" || attack === "forgery" || attack === "tampering";

  const tamperedDiffs = useMemo(
    () =>
      subtype === "message-substitution" && tamperedMessage && tamperedMessage === message
        ? "The tampered message must differ from the original."
        : null,
    [subtype, tamperedMessage, message],
  );

  const messageTooLong = showMessage && message.length > 64;
  const messageOk = message.trim().length > 0 && !messageTooLong;

  const isImpersonation = attack === "impersonation";
  const isReplay = attack === "replay";
  const isTampering = attack === "tampering";

  const valid =
    attack !== null &&
    !tamperedDiffs &&
    (isImpersonation || isReplay ? true : messageOk) &&
    (isTampering ? subtype !== null : true) &&
    (!isReplay || replayType !== null) &&
    (!needsTarget || targetLink !== null) &&
    (isTampering && subtype === "message-substitution"
      ? tamperedMessage.trim().length > 0 && !tamperedDiffs
      : true);

  /** plain-English "what will happen" preview (report 5.5) */
  const preview = useMemo(() => {
    if (attack === null) return null;
    const what =
      attack === "no-attack"
        ? `Alice will sign "${message}". No attacker configured; Bob and Charlie will both verify. Expected result: all checks pass.`
        : attack === "impersonation"
          ? 'Eve will try to start a session as Alice. Expected result: the Fidelity Test refuses the session before any key or signature exists.'
          : attack === "replay"
            ? `Eve will resend ${replayType === "unknown" ? "a session ID the ledger has never issued" : "an old, already-verified session"}. Expected result: rejected at the ledger before any quantum measurement.`
            : attack === "forgery"
              ? `Eve will build a fake signature for "${message}" without Alice's private material, against ${targetLink === "both" ? "both Bob and Charlie" : `${targetLink} only`}. Expected result: ${RejectText(targetLink)}`
              : attack === "tampering" && subtype
                ? tamperPreview(subtype, message, tamperedMessage, targetLink, intensity)
                : null;
    return what;
  }, [attack, message, tamperedMessage, targetLink, replayType, subtype, intensity]);

  const run = async () => {
    if (!attack || !valid) return;
    const config: RunConfig = {
      attack,
      subtype: attack === "tampering" ? subtype : null,
      message,
      tamperedMessage:
        subtype === "message-substitution" ? tamperedMessage : null,
      targetLink: needsTarget ? targetLink : null,
      fixedBasis: subtype === "fixed-basis" ? fixedBasis : null,
      intensityPct: subtype === "partial" ? intensity : null,
      replayType: attack === "replay" ? replayType : null,
    };
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createRun(config);
      saveRun({ sessionId: res.session_id, seed: res.seed, config, createdAt: new Date().toISOString() });
      navigate(`/run/${res.session_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the simulation. Check the backend and retry.");
      setSubmitting(false);
    }
  };

  const step2Done = attack !== null && (attack !== "tampering" || subtype !== null);
  const step3Done = valid;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 lg:px-10">
      <p className="display text-[12px] tracking-[0.18em] text-accent-ink uppercase">
        Step by step · under 20 seconds
      </p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">
        New simulation
      </h1>

      {error && (
        <div className="mt-5">
          <Banner tone="fail" title="Could not start">
            {error}
          </Banner>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => void run()}>
            Retry
          </button>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {/* STEP 1 — attack cards */}
        <section>
          <SectionHead step="01" title="Choose an attack" state={attack === null ? "active" : "done"} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ATTACK_OPTIONS.map((a) => {
              const active = attack === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAttack(a.id);
                    setSubtype(null);
                    setTargetLink(null);
                    setReplayType(null);
                  }}
                  aria-pressed={active}
                  className={`card-muted p-4 text-left transition-all ${active ? "card-selected" : "hover:border-outline-strong"}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-[var(--qs-r-sm)] bg-n-200 text-ink">
                      <Icon name={a.icon as IconName} size={18} />
                    </span>
                    <span className={`size-3 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-n-400"}`} />
                  </span>
                  <p className="mt-3 font-semibold text-ink">{a.label}</p>
                  <p className="mt-1 text-[13px] leading-snug text-n-600">{a.description}</p>
                  <span className="chip chip-neutral mt-3">{a.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        {attack === "tampering" && (
          <section>
            <SectionHead step="01.5" title="Tampering sub-type" state={subtype === null ? "active" : "done"} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {TAMPER_OPTIONS.map((t) => {
                const active = subtype === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSubtype(t.id);
                      if (!NEEDS_TARGET_SUBTYPES.includes(t.id)) setTargetLink(null);
                    }}
                    aria-pressed={active}
                    className={`card-muted p-4 text-left ${active ? "card-selected" : "hover:border-outline-strong"}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="grid size-9 place-items-center rounded-[var(--qs-r-sm)] bg-n-200 text-ink">
                        <Icon name={t.icon as IconName} size={18} />
                      </span>
                      <span className={`size-3 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-n-400"}`} />
                    </span>
                    <p className="mt-3 text-[14px] font-semibold text-ink">{t.label}</p>
                    <p className="mt-1 text-[13px] leading-snug text-n-600">{t.description}</p>
                    <p className="micro mt-3 text-n-500">{t.fingerprint}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* STEP 2 — configure */}
        <section aria-disabled={!step2Done} className={!step2Done ? "qs-disabled step-section" : "step-section"}>
          <SectionHead step="02" title="Configure attack" state={step2Done && !valid ? "active" : step2Done ? "done" : "pending"} />
          {!step2Done ? (
            <p className="mt-4 text-[14px] text-n-500">
              Select an attack above to configure it.
            </p>
          ) : (
            <div className="mt-4">
              {attack === "impersonation" && (
                <Banner tone="warn" title="Eve's fake quantum resource is created automatically">
                  She cannot demonstrate a genuine entangled link.
                </Banner>
              )}

              {showMessage && (
                <div className="card-muted space-y-4 p-5">
                  <Field
                    label="Message"
                    error={messageTooLong ? "Max 64 characters." : undefined}
                    hint={attack !== "forgery" && attack !== "tampering" ? undefined : undefined}
                  >
                    <input
                      className="qs-input font-mono"
                      value={message}
                      maxLength={80}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="e.g. TRANSFER 1000"
                    />
                    <p className="micro mt-2 flex items-center gap-1.5 text-n-500">
                      <Icon name="lock" size={12} />
                      The backend condenses the message into a fixed-size digest before signing. Long documents need a digest step.
                      {message.length} / 64
                    </p>
                  </Field>
                </div>
              )}

              {subtype === "message-substitution" && (
                <div className="card-muted mt-4 space-y-4 p-5">
                  <Field label="Tampered message" error={tamperedDiffs ?? undefined}>
                    <input
                      className="qs-input font-mono"
                      value={tamperedMessage}
                      onChange={(e) => setTamperedMessage(e.target.value)}
                      placeholder="the message Eve wants Bob/Charlie to see"
                    />
                    <p className="micro mt-2 flex items-center gap-1.5 text-n-500">
                      <Icon name="arrows-diff" size={12} /> Must differ from the original — BCH guarantees the swap changes ≥ 9 encoded positions.
                    </p>
                  </Field>
                </div>
              )}

              {attack === "replay" && (
                <div className="card-muted mt-4 space-y-2 p-5">
                  <p className="display text-[13px] font-medium tracking-[0.05em] uppercase">
                    Replay type
                  </p>
                  {REPLAY_TYPES.map((r) => (
                    <label key={r.id} className={`qs-radio-row ${replayType === r.id ? "qs-radio-on" : ""}`}>
                      <input
                        type="radio"
                        name="replay-type"
                        checked={replayType === r.id}
                        onChange={() => setReplayType(r.id)}
                      />
                      <span>
                        <span className="font-medium">{r.label}</span>
                        <span className="block text-[13px] text-n-500">{r.note}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {subtype === "partial" && (
                <div className="card-muted mt-4 p-5">
                  <Field label={`Intensity ${intensity}%`}>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={5}
                      value={intensity}
                      onChange={(e) => setIntensity(Number(e.target.value))}
                      className="qs-slider"
                    />
                    <p className="micro mt-2 text-n-500">
                      ≈ {Math.round((intensity * SYSTEM_PARAMS.slotsPerBag) / 100)} of 128 slots per bag will be attacked.
                    </p>
                  </Field>
                </div>
              )}

              {subtype === "fixed-basis" && (
                <div className="card-muted mt-4 p-5">
                  <Field label="Fixed basis">
                    <div className="flex gap-2">
                      {BASES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setFixedBasis(b)}
                          aria-pressed={fixedBasis === b}
                          className={`btn ${fixedBasis === b ? "btn-primary" : "btn-ghost"} font-mono`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <p className="micro mt-2 text-n-500">
                      Eve measures every intercepted qubit with this one basis. The other two bases end up disturbed.
                    </p>
                  </Field>
                </div>
              )}

              {needsTarget && (
                <div className="card-muted mt-4 p-5">
                  <Field
                    label="Target link"
                    hint="Attacking only one link lets you see the verifiers disagree."
                  >
                    <div className="flex gap-2">
                      {LINKS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setTargetLink(l.id)}
                          aria-pressed={targetLink === l.id}
                          className="btn btn-ghost"
                          style={targetLink === l.id ? { background: "var(--qs-fail)", color: "var(--qs-on-pass)", borderColor: "var(--qs-fail)" } : undefined}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {/* Eve's-knowledge panel */}
              {attack !== null && (
                <div className="card-muted mt-4 overflow-hidden">
                  <div className="grid gap-6 p-5 sm:grid-cols-2">
                    <div>
                      <p className="display text-[13px] font-medium tracking-[0.05em] text-fail-ink uppercase">Eve knows</p>
                      <ul className="mt-2 space-y-1 text-[14px] text-on-surface">
                        <li>✓ Public / classical information</li>
                        <li>✓ The message and signature</li>
                        {attack === "replay" && <li>✓ A genuine old transaction</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="display text-[13px] font-medium tracking-[0.05em] text-n-500 uppercase">Eve does NOT know</p>
                      <ul className="mt-2 space-y-1 text-[14px] text-on-surface">
                        <li>✗ Alice's private state assignments</li>
                        <li>✗ The unknown quantum states</li>
                        {attack === "impersonation" && <li>✗ She does not hold a genuine entangled resource</li>}
                        {attack === "replay" && <li>✗ Its quantum resource is already spent</li>}
                      </ul>
                    </div>
                  </div>
                  {selectedSub && (
                    <p className="border-t border-outline px-5 py-3 text-[13px] text-n-500">
                      <span className="display uppercase text-fail-ink">Eve's extra line:</span> {selectedSub.injectedAt}
                    </p>
                  )}
                </div>
              )}

              {/* locked system parameters */}
              <div className="mt-4 flex flex-wrap gap-2">
                <LockChip label="Slots per bag" value={SYSTEM_PARAMS.slotsPerBag} />
                <LockChip label="Bags" value={SYSTEM_PARAMS.bags} />
                <LockChip label="Pass line" value={`< ${SYSTEM_PARAMS.passLine} wrong`} />
                <LockChip label="Fidelity gate" value={`F > ${SYSTEM_PARAMS.fidelityGate}`} />
                <LockChip label="Verifiers" value="2 (Bob, Charlie)" />
                <LockChip label="Honest error rate" value="2%" />
              </div>
            </div>
          )}
        </section>

        {/* STEP 3 — review & run */}
        <section className={`step-section ${!step3Done ? "qs-disabled" : ""}`}>
          <SectionHead step="03" title="Review & run" state={step3Done ? "active" : "pending"} />
          {!step3Done ? (
            <p className="mt-4 text-[14px] text-n-500">
              Finish the configuration above to run.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="card-muted space-y-4 p-5">
                <div>
                  <p className="display text-[13px] font-medium tracking-[0.05em] uppercase">What will happen</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-on-surface">{preview}</p>
                </div>
                <div className="border-t border-outline pt-4">
                  <p className="display text-[13px] font-medium tracking-[0.05em] uppercase">Preview strip</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="chip chip-fail"><Icon name="bug" size={13} /> Eve acts here — {selected?.injectedAt === "—" ? "on the link" : selected?.injectedAt}</span>
                    <Icon name="arrow-right" size={14} className="text-n-500" />
                    <span className="chip chip-pass"><Icon name="shield-check" size={13} /> caught here — {selectedSub ? selectedSub.caughtAt : selected?.caughtAt}</span>
                  </p>
                </div>
                <div className="border-t border-outline pt-4">
                  <p className="display text-[13px] font-medium tracking-[0.05em] uppercase">Summary</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 text-[13px]">
                    <div><dt className="text-n-500">Attack</dt><dd className="font-medium text-ink">{selected?.label}</dd></div>
                    {subtype && <div><dt className="text-n-500">Sub-type</dt><dd className="font-medium text-ink">{selectedSub?.label}</dd></div>}
                    {needsTarget && <div><dt className="text-n-500">Target</dt><dd className="font-medium text-ink">{targetLink === "both" ? "Bob & Charlie" : targetLink}</dd></div>}
                    {attack === "replay" && <div><dt className="text-n-500">Replay</dt><dd className="font-medium text-ink">{replayType === "unknown" ? "Unknown ID" : "USED session"}</dd></div>}
                    <div><dt className="text-n-500">Message</dt><dd className="font-mono text-ink">{message}</dd></div>
                    {subtype === "message-substitution" && <div><dt className="text-n-500">Tampered</dt><dd className="font-mono text-warn">{tamperedMessage}</dd></div>}
                    {subtype === "partial" && <div><dt className="text-n-500">Intensity</dt><dd className="font-medium text-ink">{intensity}%</dd></div>}
                  </dl>
                </div>
              </div>
              <div className="card-muted flex flex-col justify-between gap-6 p-5">
                <div>
                  <p className="display text-[13px] font-medium tracking-[0.05em] uppercase">System parameters (locked)</p>
                  <p className="micro mt-2 flex items-start gap-1.5 text-n-500">
                    <Icon name="lock" size={12} className="mt-0.5" /> Fixed by the backend so the statistics stay valid. Random seed is stored for reproducibility.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button type="button" className="btn btn-primary btn-lg" disabled={submitting} onClick={() => void run()}>
                    {submitting ? (
                      <>
                        <span className="spinner" /> Creating session…
                      </>
                    ) : (
                      <>
                        Run simulation <Icon name="player-play" size={16} />
                      </>
                    )}
                  </button>
                  <Link to="/" className="btn btn-ghost">
                    Back to landing
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <p className="micro mt-8 flex items-center gap-1.5 text-n-500">
        <StatusBadge tone="brand">Prototype</StatusBadge> Everything above is a prototype simulation.{" "}
        <Term term="Severity score">A 0–10 project-specific rating of an incident.</Term>
      </p>
    </div>
  );
}

function tamperPreview(
  subtype: TamperingSubtype,
  message: string,
  tamperedMessage: string,
  targetLink: TargetLink | null,
  intensity: number,
): string {
  const to = targetLink === "both" ? "both Bob and Charlie" : `${targetLink ?? "the target"} only`;
  switch (subtype) {
    case "fixed-basis":
      return `Alice will sign "${message}". Eve will intercept the quantum link to ${to}, measuring every qubit with one fixed basis and re-sending new qubits. Expected result: ${RejectText(targetLink)}`;
    case "random-basis":
      return `Alice will sign "${message}". Eve will attack the link to ${to}, guessing a basis for every qubit she intercepts. Bob and Charlie will both verify. Expected result: ${RejectText(targetLink)}`;
    case "partial":
      return `Alice will sign "${message}". Eve will attack about ${Math.round((intensity * 128) / 100)} of 128 slots per bag on the link to ${to}. Expected result: ${RejectText(targetLink)}`;
    case "message-substitution":
      return `Alice will sign "${message}", then Eve will substitute "${tamperedMessage}" on the classical path to ${to}. Expected result: the mismatch at changed positions gives it away.`;
    case "correction-bit":
      return `Alice will sign "${message}". Eve will edit the teleportation correction bits on the classical link to ${to}. Expected result: ${RejectText(targetLink)}`;
  }
}

function RejectText(targetLink: TargetLink | null): string {
  return targetLink === "bob" || targetLink === "charlie"
    ? `${targetLink === "bob" ? "Bob" : "Charlie"} rejects; the other accepts — verifiers disagree.`
    : "both verifiers reject.";
}