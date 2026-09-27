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

import type { ReactNode } from "react";
import {
  IconActivity,
  IconAlertTriangle,
  IconAtom,
  IconChartBar,
  IconEye,
  IconListDetails,
  IconLock,
  IconScale,
  IconShieldCheck,
} from "@tabler/icons-react";

/* ------------------------------------------------------------------ */
/*  Icon — the fixed concept mapping                                    */
/* ------------------------------------------------------------------ */

export type IconName =
  | "atom"
  | "lock"
  | "shield-check"
  | "alert-triangle"
  | "eye"
  | "scale"
  | "activity"
  | "chart-bar"
  | "list-details";

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
          className="condensed text-[12px] font-medium tracking-[0.06em] uppercase"
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

export const PHASES = [
  { id: "keygen", label: "Key Gen" },
  { id: "distribution", label: "Distribution" },
  { id: "signing", label: "Signing" },
  { id: "verification", label: "Verification" },
  { id: "result", label: "Result" },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

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
          <li key={phase.id} className="flex flex-1 items-start">
            <div className="flex flex-col items-center gap-2">
              <span
                className={`grid size-7 place-items-center rounded-[var(--qs-r-sm)] border font-mono text-[12px] font-semibold ${
                  state === "done"
                    ? "border-pass bg-pass text-on-pass"
                    : state === "active"
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-strong bg-surface text-n-500"
                }`}
              >
                {state === "done" ? <Icon name="shield-check" size={14} /> : i + 1}
              </span>
              <span
                className={`condensed text-center text-[12px] tracking-[0.04em] uppercase ${
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
                className={`mx-2 mt-3.5 h-px flex-1 ${
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
      ? "text-pass"
      : tone === "fail"
        ? "text-fail"
        : tone === "brand"
          ? "text-accent-ink"
          : "text-on-bg";
  return (
    <div className="card-muted p-4">
      <p className="condensed text-[12px] tracking-[0.06em] text-n-500 uppercase">
        {label}
      </p>
      <p className={`num mt-2 text-[28px] leading-none font-semibold ${toneText}`}>
        {value}
        {unit && (
          <span className="ml-1 text-[14px] font-normal text-n-500">{unit}</span>
        )}
      </p>
      {hint && <p className="mt-2 text-[13px] leading-snug text-n-500">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ParamSlider — labelled slider with live numeric readout             */
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
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="condensed text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase">
          {label}
        </label>
        <span className="num text-[14px] font-semibold text-on-bg">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-n-200 accent-[var(--qs-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={label}
      />
      {hint && <p className="mt-1.5 text-[13px] text-n-500">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ComparisonBar — two-bar horizontal comparison, fixed violet/teal   */
/* ------------------------------------------------------------------ */

export function ComparisonBar({
  label,
  left,
  right,
  leftLabel,
  rightLabel,
  format = (v: number) => v.toFixed(3),
}: {
  label: string;
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(left, right, 1e-12);
  return (
    <div>
      <p className="condensed mb-2 text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase">
        {label}
      </p>
      <div className="space-y-2.5">
        {[
          { v: left, name: leftLabel, bar: "var(--qs-primary)", text: "text-accent-ink" },
          { v: right, name: rightLabel, bar: "var(--qs-secondary)", text: "text-pass" },
        ].map((row) => (
          <div key={row.name}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-n-600">{row.name}</span>
              <span className={`num text-[13px] font-semibold ${row.text}`}>
                {format(row.v)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-n-200">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(row.v / max) * 100}%`, background: row.bar }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VerifierPanel — one verifier's identity, outcome, verdict          */
/* ------------------------------------------------------------------ */

export function VerifierPanel({
  name,
  index,
  mismatchRate,
  verdict,
  timestamp,
  active = false,
}: {
  name: string;
  index: number;
  mismatchRate: number;
  verdict: "accepted" | "rejected" | "pending";
  timestamp?: string;
  active?: boolean;
}) {
  return (
    <div
      className={`card-muted p-4 ${active ? "ring-1 ring-primary" : ""}`}
      aria-label={`Verifier ${name}`}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-[var(--qs-r-sm)] bg-surface-2 text-n-600">
          <Icon name="eye" size={15} />
        </span>
        <div className="min-w-0">
          <p className="condensed truncate text-[13px] font-semibold text-on-surface">
            {name}
          </p>
          <p className="micro text-n-500">Verifier {index}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="condensed text-[12px] text-n-500 uppercase">Mismatch</dt>
          <dd className="num text-[14px] font-semibold text-on-surface">
            {mismatchRate.toFixed(3)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="condensed text-[12px] text-n-500 uppercase">Verdict</dt>
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
            <dt className="condensed text-[12px] text-n-500 uppercase">Reported</dt>
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
  flaggedBy: string;
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
      <td className="px-3 py-2.5 whitespace-nowrap text-n-600">{flaggedBy}</td>
    </tr>
  );
}
