/**
 * Reusable component inventory — UI/UX design report, section 2.4.
 *
 * Every visual in the app is built from these. Nothing ad-hoc.
 *
 * Icon set is Tabler (outline). The mapping is fixed by the spec:
 *   qubit/quantum state      -> IconAtom
 *   classical channel / auth  -> IconLock
 *   verification passed       -> IconShieldCheck   (teal)
 *   attack detected/rejected  -> IconAlertTriangle (red)
 *   verifier                  -> IconEye
 *   arbiter / dispute         -> IconScale
 *   live activity             -> IconActivity
 *   analytics / history       -> IconChartBar
 *   event log                 -> IconListDetails
 * No decorative icons. If a concept has no mapping, it gets no icon.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { animate } from "animejs";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconAtom,
  IconChartBar,
  IconCircleCheck,
  IconClock,
  IconCpu,
  IconDownload,
  IconEye,
  IconFlask,
  IconListDetails,
  IconLock,
  IconScale,
  IconSearch,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { IconName } from "../../lib/iconNames";
import { mechanismLabel } from "../../lib/formatting";
import { PHASES, type PhaseId } from "../../lib/phases";
import type { DetectionMechanism } from "../../api/types";

export type { IconName };

/* ------------------------------------------------------------------ */
/*  Icon — the fixed concept mapping                                    */
/* ------------------------------------------------------------------ */

const ICONS: Record<IconName, (p: { size?: number; className?: string }) => ReactNode> = {
  atom: (p) => <IconAtom {...p} />,
  lock: (p) => <IconLock {...p} />,
  "shield-check": (p) => <IconShieldCheck {...p} />,
  "alert-triangle": (p) => <IconAlertTriangle {...p} />,
  eye: (p) => <IconEye {...p} />,
  scale: (p) => <IconScale {...p} />,
  activity: (p) => <IconActivity {...p} />,
  "chart-bar": (p) => <IconChartBar {...p} />,
  "list-details": (p) => <IconListDetails {...p} />,
  search: (p) => <IconSearch {...p} />,
  flask: (p) => <IconFlask {...p} />,
  clock: (p) => <IconClock {...p} />,
  download: (p) => <IconDownload {...p} />,
  "arrow-right": (p) => <IconArrowRight {...p} />,
  "circle-check": (p) => <IconCircleCheck {...p} />,
  cpu: (p) => <IconCpu {...p} />,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return <>{ICONS[name]({ size, className })}</>;
}

/* ------------------------------------------------------------------ */
/*  StatusBadge — pill label, coloured by state                       */
/* ------------------------------------------------------------------ */

export type BadgeTone = "honest" | "attack" | "pending" | "disputed" | "neutral";

const BADGE_TONE: Record<BadgeTone, string> = {
  honest: "chip-pass",
  attack: "chip-fail",
  pending: "chip-pending",
  disputed: "chip-brand",
  neutral: "chip-neutral",
};

const BADGE_ICON: Partial<Record<BadgeTone, IconName>> = {
  honest: "shield-check",
  attack: "alert-triangle",
  disputed: "scale",
};

export function StatusBadge({
  tone,
  children,
  className = "",
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  const icon = BADGE_ICON[tone];
  return (
    <span className={`chip ${BADGE_TONE[tone]} ${className}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  SectionHead — ruled band with a numbered index                      */
/* ------------------------------------------------------------------ */

export function SectionHead({
  step,
  title,
  state = "pending",
  children,
}: {
  step: string;
  title: string;
  state?: "pending" | "active" | "done";
  children?: ReactNode;
}) {
  return (
    <div className="section-band" data-state={state}>
      <span className="idx">{step}</span>
      <span className="band-title">{title}</span>
      {state !== "pending" && (
        <span className="band-state">
          {state === "done" ? "done" : "active"}
        </span>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel — the hairline card                                           */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className = "",
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return <div className={`${muted ? "card-muted" : "card"} ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  Banner — status strip. `accent` paints border/tint, `ink` the text */
/* ------------------------------------------------------------------ */

type Tone = "pass" | "fail" | "warn" | "pending" | "neutral" | "brand";

const BANNER: Record<Tone, { accent: string; ink: string; icon?: IconName }> = {
  pass: { accent: "var(--qs-pass)", ink: "var(--qs-pass)", icon: "shield-check" },
  fail: { accent: "var(--qs-fail)", ink: "var(--qs-fail)", icon: "alert-triangle" },
  warn: { accent: "var(--qs-warn)", ink: "var(--qs-warn)", icon: "alert-triangle" },
  pending: { accent: "var(--qs-pending)", ink: "var(--qs-pending)" },
  neutral: { accent: "var(--qs-n-400)", ink: "var(--qs-n-500)", icon: "list-details" },
  brand: { accent: "var(--qs-primary)", ink: "var(--qs-accent-ink)", icon: "atom" },
};

export function Banner({
  tone,
  title,
  children,
  className = "",
  animate = false,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  className?: string;
  animate?: boolean;
}) {
  const style = BANNER[tone];
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 border py-3 pr-4 pl-3.5 ${
        animate ? "animate-pop" : ""
      } ${className}`}
      style={{
        borderColor: style.accent,
        background: `color-mix(in oklab, ${style.accent} 6%, transparent)`,
        borderLeftWidth: 3,
        borderRadius: "var(--qs-r)",
      }}
      role="status"
    >
      <span style={{ color: style.ink }} className="shrink-0">
        {style.icon && <Icon name={style.icon} size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="display text-[12px] font-medium tracking-[0.06em] uppercase"
          style={{ color: style.ink }}
        >
          {title}
        </p>
        {children && (
          <div className="mt-1 text-[14px] leading-relaxed text-on-surface">{children}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PhaseStepper — 5 nodes: Key Gen → Distribution → Signing →         */
/*  Verification → Result                                              */
/* ------------------------------------------------------------------ */



export function PhaseStepper({
  current,
  maxReached,
}: {
  current: PhaseId;
  maxReached: PhaseId;
}) {
  const currentIdx = PHASES.findIndex((p) => p.id === current);
  const maxIdx = PHASES.findIndex((p) => p.id === maxReached);
  return (
    <ol className="flex items-start gap-0" aria-label="Simulation phases">
      {PHASES.map((phase, i) => {
        const state =
          i < maxIdx ? "done" : i === currentIdx ? "active" : "pending";
        return (
          <li key={phase.id} className="flex min-w-0 flex-1 items-start" aria-label={phase.label}>
            <div
              className="flex min-w-0 flex-col items-center gap-2"
              aria-current={i === currentIdx ? "step" : undefined}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-[var(--qs-r-sm)] border font-mono text-[12px] font-semibold ${
                  state === "done"
                    ? "border-pass bg-pass text-on-pass"
                    : state === "active"
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-strong bg-surface text-n-500"
                }`}
              >
                {state === "done" ? <Icon name="shield-check" size={14} /> : i + 1}
              </span>
              {/* the labels do not fit five-across on a phone; the stepper's
                  aria-label and the live status line carry the same words */}
              <span
                className={`display hidden text-center text-[12px] tracking-[0.04em] uppercase sm:block ${
                  state === "active"
                    ? "font-semibold text-on-bg"
                    : state === "done"
                      ? "text-n-600"
                      : "text-n-500"
                }`}
              >
                {phase.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <span
                aria-hidden
                className={`mx-1 mt-3.5 h-px flex-1 sm:mx-2 ${
                  i < maxIdx ? "bg-pass" : "bg-outline"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/*  DataCard — labelled numeric stat. Value in Plex Mono, label in     */
/*  Plex Sans Condensed.                                               */
/* ------------------------------------------------------------------ */

export function DataCard({
  label,
  value,
  unit,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "neutral" | "pass" | "fail" | "brand";
  hint?: string;
}) {
  const toneText =
    tone === "pass"
      ? "text-pass-ink"
      : tone === "fail"
        ? "text-fail-ink"
        : tone === "brand"
          ? "text-accent-ink"
          : "text-on-bg";
  // numeric values count up; anything else renders as-is
  const numeric = typeof value === "number" ? value : null;
  return (
    <div className="card-muted p-4">
      <p className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">
        {label}
      </p>
      <p className={`num mt-2 text-[28px] leading-none font-semibold ${toneText}`}>
        {numeric !== null ? <CountUp value={numeric} /> : value}
        {unit && (
          <span className="ml-1 text-[14px] font-normal text-n-500">{unit}</span>
        )}
      </p>
      {hint && <p className="mt-2 text-[13px] leading-snug text-n-500">{hint}</p>}
    </div>
  );
}

/** Counts a number up to its value via anime.js. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);

  useEffect(() => {
    const from = current.current;
    const state = { v: from };
    const anim = animate(state, {
      v: value,
      duration: 900,
      ease: "outExpo",
      onUpdate: () => {
        current.current = state.v;
        if (ref.current) {
          ref.current.textContent = state.v.toFixed(3);
        }
      },
    });
    return () => {
      anim.cancel();
    };
  }, [value]);

  return <span ref={ref}>{(0).toFixed(3)}</span>;
}

/* ------------------------------------------------------------------ */
/*  ParamSlider — labelled slider with live numeric readout. `min`,      */
/*  `max` and `step` come from the backend, never from this file.        */
/* ------------------------------------------------------------------ */

export function ParamSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  disabled = false,
  hint,
  error,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="display text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase"
        >
          {label}
        </label>
        <span className="num text-[14px] font-semibold text-on-bg">
          {format(value)}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={hint || error ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-n-200 accent-[var(--qs-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="num text-[12px] text-n-500">
          {format(min)}
          {unit}
        </span>
        <span className="num text-[12px] text-n-500">
          {format(max)}
          {unit}
        </span>
      </div>
      {(hint || error) && (
        <p
          id={hintId}
          className={`mt-1.5 text-[13px] ${error ? "text-fail-ink" : "text-n-500"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Verifier count is a small discrete choice, so it gets buttons not a slider. */
export function CountStepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled = false,
  hint,
  error,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
}) {
  const hintId = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="display text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase">
        {label}
      </legend>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-describedby={hintId}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => {
          const active = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={active}
              aria-label={`${n} verifier${n === 1 ? "" : "s"}`}
              className={`num size-9 rounded-[var(--qs-r)] border text-[14px] font-semibold transition-colors ${
                active
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-strong bg-surface text-n-600 hover:border-outline-strong hover:text-on-bg"
              }`}
            >
              {n}
            </button>
          );
        })}
        <span className="num ml-1 text-[12px] text-n-500">
          {value} selected
        </span>
      </div>
      {(hint || error) && (
        <p id={hintId} className={`mt-1.5 text-[13px] ${error ? "text-fail-ink" : "text-n-500"}`}>
          {error ?? hint}
        </p>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/*  ComparisonBar — n-bar comparison. Every value is backend-supplied;    */
/*  the optional marker is the backend-derived threshold.                */
/* ------------------------------------------------------------------ */

export interface ComparisonRow {
  name: string;
  value: number;
  /** "primary" for the first series, "secondary" for the comparison, "pass" for a good outcome, "fail" for a bad one */
  tone?: "primary" | "secondary" | "pass" | "fail";
}

const ROW_TONE: Record<NonNullable<ComparisonRow["tone"]>, { bar: string; text: string }> = {
  primary: { bar: "var(--qs-primary)", text: "text-accent-ink" },
  secondary: { bar: "var(--qs-secondary)", text: "text-pass-ink" },
  pass: { bar: "var(--qs-pass)", text: "text-pass-ink" },
  fail: { bar: "var(--qs-fail)", text: "text-fail-ink" },
};

export function ComparisonBar({
  label,
  rows,
  format = (v: number) => v.toFixed(3),
  unit,
  marker,
}: {
  label: string;
  rows: ComparisonRow[];
  format?: (v: number) => string;
  unit?: string;
  /** a reference line, e.g. the detection threshold */
  marker?: { value: number; label: string };
}) {
  const max = Math.max(...rows.map((r) => r.value), marker?.value ?? 0, 1e-12);
  return (
    <figure>
      <figcaption className="display mb-2 text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase">
        {label}
        {unit ? <span className="ml-1 normal-case text-n-500">({unit})</span> : null}
      </figcaption>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const tone = ROW_TONE[row.tone ?? "primary"];
          return (
            <div key={row.name}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-n-600">{row.name}</span>
                <span className={`num text-[13px] font-semibold ${tone.text}`}>
                  {format(row.value)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-n-200">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${(row.value / max) * 100}%`, background: tone.bar }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {marker && (
        <p className="num mt-2 text-[12px] text-n-500">
          {marker.label}: {format(marker.value)}
        </p>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  EmptyState — used wherever the backend has nothing to report.        */
/*  "Data unavailable" beats a fabricated chart.                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card-muted px-4 py-6 text-center">
      <p className="display text-[13px] font-medium tracking-[0.04em] text-n-600 uppercase">
        {title}
      </p>
      {children && (
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-n-500">
          {children}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VerifierPanel — one verifier's identity, outcome, verdict. Shows     */
/*  whichever measurement the backend actually sent: a mismatch rate     */
/*  where it has one, otherwise the block counts it does have.           */
/* ------------------------------------------------------------------ */

export function VerifierPanel({
  name,
  index,
  verdict,
  timestamp,
  active = false,
  mismatchRate,
  blocks,
}: {
  name: string;
  index: number;
  verdict: "accepted" | "rejected" | "pending";
  timestamp?: string;
  active?: boolean;
  mismatchRate?: number;
  blocks?: { failed: number; total: number };
}) {
  return (
    <div
      className={`card-muted p-4 ${active ? "ring-1 ring-primary" : ""}`}
      aria-label={`Verifier ${index}: ${name}`}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--qs-r-sm)] bg-surface-2 text-n-600">
          <Icon name="eye" size={15} />
        </span>
        <div className="min-w-0">
          <p className="display truncate text-[13px] font-semibold text-on-surface">
            {name}
          </p>
          <p className="micro text-n-500">Verifier {index}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2.5">
        {mismatchRate !== undefined && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="display text-[12px] tracking-[0.04em] text-n-500 uppercase">
              Mismatch
            </dt>
            <dd className="num text-[14px] font-semibold text-on-surface">
              {mismatchRate.toFixed(3)}
            </dd>
          </div>
        )}
        {blocks && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="display text-[12px] tracking-[0.04em] text-n-500 uppercase">
              Blocks failed
            </dt>
            <dd className="num text-[14px] font-semibold text-on-surface">
              {blocks.failed} / {blocks.total}
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="display text-[12px] tracking-[0.04em] text-n-500 uppercase">
            Verdict
          </dt>
          <dd>
            <StatusBadge
              tone={verdict === "accepted" ? "honest" : verdict === "rejected" ? "attack" : "pending"}
            >
              {verdict}
            </StatusBadge>
          </dd>
        </div>
        {timestamp && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="display text-[12px] tracking-[0.04em] text-n-500 uppercase">
              Reported
            </dt>
            <dd className="num text-[12px] text-n-500">{timestamp}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EventLogRow — timestamp + attack type + verdict + flagged-by        */
/* ------------------------------------------------------------------ */

export function EventLogRow({
  timestamp,
  attackType,
  runId,
  verdict,
  flaggedBy,
  detected,
}: {
  timestamp: string;
  attackType: string;
  runId: string;
  verdict: "accepted" | "rejected";
  flaggedBy: DetectionMechanism;
  detected: boolean;
}) {
  return (
    <tr
      className={`border-b border-outline text-[13px] last:border-0 ${
        detected ? "bg-fail-tint" : ""
      }`}
    >
      <td className="num px-3 py-2.5 whitespace-nowrap text-n-500">{timestamp}</td>
      <td className="px-3 py-2.5 whitespace-nowrap text-on-surface">{attackType}</td>
      <td className="num px-3 py-2.5 whitespace-nowrap text-n-500">{runId}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <StatusBadge tone={detected ? "attack" : "honest"}>{verdict}</StatusBadge>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-n-600">
        {mechanismLabel(flaggedBy)}
      </td>
    </tr>
  );
}
