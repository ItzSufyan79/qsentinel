/**
 * Reusable component inventory — UI/UX design report, section 2.4.
 *
 * Every visual in the app is built from these. Icon set is Tabler (outline),
 * fixed concept mapping, no decorative icons. Every pass/fail pairs color with
 * an icon and a word — never color alone.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { animate } from "animejs";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsDiff,
  IconAtom,
  IconBook,
  IconBug,
  IconChartBar,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconClipboard,
  IconCpu,
  IconDownload,
  IconEye,
  IconFlask,
  IconGridDots,
  IconHistory,
  IconList,
  IconListDetails,
  IconLock,
  IconLockQuestion,
  IconMoodCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconRepeat,
  IconScale,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconSignature,
  IconSparkles,
  IconTools,
  IconUpload,
  IconUserCheck,
} from "@tabler/icons-react";
import type { IconName } from "../../lib/iconNames";

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
  "circle-x": (p) => <IconCircleX {...p} />,
  cpu: (p) => <IconCpu {...p} />,
  "arrows-diff": (p) => <IconArrowsDiff {...p} />,
  "grid-dots": (p) => <IconGridDots {...p} />,
  repeat: (p) => <IconRepeat {...p} />,
  signature: (p) => <IconSignature {...p} />,
  history: (p) => <IconHistory {...p} />,
  "user-check": (p) => <IconUserCheck {...p} />,
  "lock-question": (p) => <IconLockQuestion {...p} />,
  book: (p) => <IconBook {...p} />,
  "magnifying-glass": (p) => <IconSearch {...p} />,
  "player-play": (p) => <IconPlayerPlay {...p} />,
  "player-pause": (p) => <IconPlayerPause {...p} />,
  "player-skip-forward": (p) => <IconPlayerSkipForward {...p} />,
  "player-track-next": (p) => <IconPlayerTrackNext {...p} />,
  "player-track-prev": (p) => <IconPlayerTrackPrev {...p} />,
  settings: (p) => <IconSettings {...p} />,
  bug: (p) => <IconBug {...p} />,
  list: (p) => <IconList {...p} />,
  upload: (p) => <IconUpload {...p} />,
  clipboard: (p) => <IconClipboard {...p} />,
  "mood-check": (p) => <IconMoodCheck {...p} />,
  sparkles: (p) => <IconSparkles {...p} />,
  tools: (p) => <IconTools {...p} />,
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
/*  StatusBadge — pill label, coloured by state                        */
/* ------------------------------------------------------------------ */

export type BadgeTone = "honest" | "attack" | "pending" | "warn" | "neutral" | "brand";

const BADGE_TONE: Record<BadgeTone, string> = {
  honest: "chip-pass",
  attack: "chip-fail",
  pending: "chip-pending",
  warn: "chip-warn",
  neutral: "chip-neutral",
  brand: "chip-brand",
};

const BADGE_ICON: Partial<Record<BadgeTone, IconName>> = {
  honest: "circle-check",
  attack: "circle-x",
  warn: "alert-triangle",
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

/** Pass/fail glyph plus word — the colour is never the only signal. */
export function Outcome({
  ok,
  children,
}: {
  ok: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`chip ${ok ? "chip-pass" : "chip-fail"}`}>
      <Icon name={ok ? "circle-check" : "circle-x"} size={13} />
      {children}
    </span>
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
/*  Banner — status strip. `accent` paints border/tint, `ink` the text */
/* ------------------------------------------------------------------ */

type Tone = "pass" | "fail" | "warn" | "pending" | "neutral" | "brand";

const BANNER: Record<Tone, { accent: string; ink: string; icon?: IconName }> = {
  pass: { accent: "var(--qs-pass)", ink: "var(--qs-pass-ink)", icon: "circle-check" },
  fail: { accent: "var(--qs-fail)", ink: "var(--qs-fail-ink)", icon: "circle-x" },
  warn: { accent: "var(--qs-warn)", ink: "var(--qs-warn)", icon: "alert-triangle" },
  pending: { accent: "var(--qs-pending)", ink: "var(--qs-pending)", icon: "clock" },
  neutral: { accent: "var(--qs-n-400)", ink: "var(--qs-n-500)", icon: "list-details" },
  brand: { accent: "var(--qs-primary)", ink: "var(--qs-accent-ink)", icon: "atom" },
};

export function Banner({
  tone,
  title,
  children,
  className = "",
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = BANNER[tone];
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 border py-3 pr-4 pl-3.5 ${className}`}
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
/*  Tooltip term — dotted underline + glossary popover. First use of any*/
/*  jargon gets one (report principle 6).                               */
/* ------------------------------------------------------------------ */

export function Term({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="term" data-term={id}>
      <span className="term-label" tabIndex={0} aria-describedby={id}>
        {term}
      </span>
      <span role="tooltip" id={id} className="term-pop">
        {children}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  LockChip — a read-only, backend-fixed parameter (report 5.5)        */
/* ------------------------------------------------------------------ */

export function LockChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="lock-chip" title="Fixed by the backend so the statistics stay valid.">
      <Icon name="lock" size={12} />
      <span className="display lock-chip-label">{label}</span>
      <span className="num lock-chip-value">{value}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  NotRun — the slim muted card for "panel not reached" (report 3.4)   */
/* ------------------------------------------------------------------ */

export function NotRun({
  reason = "Not run — the session was rejected before quantum verification.",
}: {
  reason?: string;
}) {
  return (
    <div className="card-muted not-run" role="note">
      <Outcome ok={false}>Not run</Outcome>
      <p className="caption-text mt-2">{reason}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetricCard — label, big mono value, status chip (report 2.4)        */
/* ------------------------------------------------------------------ */

export function MetricCard({
  label,
  value,
  unit,
  tone = "neutral",
  chip,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "neutral" | "pass" | "fail" | "brand";
  chip?: ReactNode;
}) {
  const toneText =
    tone === "pass"
      ? "text-pass-ink"
      : tone === "fail"
        ? "text-fail-ink"
        : tone === "brand"
          ? "text-accent-ink"
          : "text-on-bg";
  const numeric = typeof value === "number" ? value : null;
  return (
    <div className="card-muted p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">
          {label}
        </p>
        {chip}
      </div>
      <p className={`num mt-2 text-[28px] leading-none font-semibold ${toneText}`}>
        {numeric !== null ? <CountUp value={numeric} /> : value}
        {unit && (
          <span className="ml-1 text-[14px] font-normal text-n-500">{unit}</span>
        )}
      </p>
    </div>
  );
}

/** Counts a number up to its value via anime.js. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);

  useEffect(() => {
    const state = { v: current.current };
    const anim = animate(state, {
      v: value,
      duration: 700,
      ease: "outExpo",
      onUpdate: () => {
        current.current = state.v;
        if (ref.current) ref.current.textContent = state.v.toFixed(3);
      },
    });
    return () => {
      anim.cancel();
    };
  }, [value]);

  return <span ref={ref}>{(0).toFixed(3)}</span>;
}

/* ------------------------------------------------------------------ */
/*  CaptionBlock — the explainability spine (report 7.6): every card   */
/*  answers "What am I looking at? How do I read it?" and "This run".   */
/*  Open by default the first time; the choice is remembered per card.  */
/* ------------------------------------------------------------------ */

export function CaptionBlock({
  what,
  how,
  run,
  more,
}: {
  what: string;
  how: string;
  /** generated from THIS run's backend values */
  run: string | null;
  more?: string;
}) {
  const id = useId();
  const [show, setShow] = useState(() => {
    const saved = localStorage.getItem(`qs-caption:${id}`);
    return saved === null ? true : saved === "1";
  });
  const [openMore, setOpenMore] = useState(false);

  useEffect(() => {
    localStorage.setItem(`qs-caption:${id}`, show ? "1" : "0");
  }, [show, id]);

  return (
    <div className="caption-block" data-open={show}>
      <div className="caption-row">
        <span className="display caption-kicker">Caption</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={show}
          onClick={() => setShow((v) => !v)}
        >
          {show ? "Hide" : "Show"} caption
        </button>
      </div>
      {show && (
        <dl className="caption-grid">
          <div>
            <dt>What am I looking at?</dt>
            <dd>{what}</dd>
          </div>
          <div>
            <dt>How do I read it?</dt>
            <dd>{how}</dd>
          </div>
          {run && (
            <div>
              <dt>This run</dt>
              <dd className="num-run">{run}</dd>
            </div>
          )}
        </dl>
      )}
      {more && (
        <button
          type="button"
          className="mt-2 text-[12px] font-medium text-accent-ink underline decoration-dotted underline-offset-4"
          aria-expanded={openMore}
          onClick={() => setOpenMore((v) => !v)}
        >
          {openMore ? "Hide" : "Tell me more"}
        </button>
      )}
      {openMore && more && <p className="mt-2 text-[13px] leading-relaxed text-n-600">{more}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StageStepper — the 6-node live pipeline (report 6.1)                */
/* ------------------------------------------------------------------ */

export interface StepperNode {
  id: string;
  num: string;
  label: string;
  state: "pending" | "active" | "done" | "locked";
}

export function StageStepper({
  nodes,
  ariaLabel,
}: {
  nodes: StepperNode[];
  ariaLabel: string;
}) {
  return (
    <ol className="qs-stepper" aria-label={ariaLabel}>
      {nodes.map((n, i) => (
        <li key={n.id} className={n.state} aria-current={n.state === "active" ? "step" : undefined}>
          <span className="qs-step-num">
            {n.state === "locked" ? (
              <Icon name="lock" size={13} />
            ) : n.state === "done" ? (
              <Icon name="circle-check" size={13} />
            ) : (
              n.num
            )}
          </span>
          <span className="qs-step-label">
            {n.label}
            {n.state === "locked" && <em>Not reached</em>}
          </span>
          {i < nodes.length - 1 && <span className="qs-step-line" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/*  Gauge — fidelity (0–1 semicircle) and severity (0–10) bugs          */
/* ------------------------------------------------------------------ */

export function FidelityGauge({
  value,
  gate,
  mark = 0.25,
  status,
}: {
  value: number;
  gate: number;
  mark?: number;
  status: "pass" | "fail" | "measuring";
}) {
  const color =
    status === "fail"
      ? "var(--qs-fail)"
      : status === "pass"
        ? "var(--qs-pass)"
        : "var(--qs-pending)";
  const ink =
    status === "fail"
      ? "var(--qs-fail-ink)"
      : status === "pass"
        ? "var(--qs-pass-ink)"
        : "var(--qs-pending)";
  const needle = Math.max(0.02, Math.min(0.98, value));
  return (
    <figure className="gauge" aria-label={`Fidelity F = ${value.toFixed(2)}`}>
      <svg viewBox="0 0 220 120" role="img" aria-hidden="true">
        <path d="M15 105 A 95 95 0 0 1 205 105" fill="none" stroke="var(--qs-n-200)" strokeWidth="14" strokeLinecap="butt" />
        <path
          d="M15 105 A 95 95 0 0 1 205 105"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="butt"
          pathLength={1}
          strokeDasharray={`${needle} 1`}
        />
        {/* 0.5 gate line */}
        <line x1="110" y1="13" x2="110" y2="30" stroke="var(--qs-ink)" strokeWidth="2" />
        <text x="110" y="46" textAnchor="middle" className="gauge-text">
          gate {gate}
        </text>
        {/* 0.25 "no entanglement" marker */}
        <line x1="62" y1="105" x2="62" y2="88" stroke="var(--qs-n-500)" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x="40" y="122" textAnchor="middle" className="gauge-text dim">
          {mark} no entanglement
        </text>
        <text x="205" y="122" textAnchor="end" className="gauge-text">
          1
        </text>
      </svg>
      <figcaption>
        <span className="num" style={{ color: ink }}>
          F = {value.toFixed(2)}
        </span>
        {status === "fail" && <Outcome ok={false}>Failed</Outcome>}
        {status === "pass" && <Outcome ok>Passed</Outcome>}
      </figcaption>
    </figure>
  );
}

/** Severity 0–10 with a label; the three component bars are in Results. */
export function SeverityGauge({ score }: { score: number }) {
  const tone = score === 0 ? "pass" : score <= 3 ? "pending" : score <= 6 ? "warn" : "fail";
  const color =
    tone === "pass"
      ? "var(--qs-pass)"
      : tone === "pending"
        ? "var(--qs-pending)"
        : tone === "warn"
          ? "var(--qs-warn)"
          : "var(--qs-fail)";
  const ink =
    tone === "pass"
      ? "var(--qs-pass-ink)"
      : tone === "pending"
        ? "var(--qs-pending)"
        : tone === "warn"
          ? "var(--qs-warn)"
          : "var(--qs-fail-ink)";
  const label = score === 0 ? "None" : score <= 3 ? "Low" : score <= 6 ? "Medium" : score <= 9 ? "High" : "Critical";
  return (
    <div className="severity" aria-label={`Severity ${score} of 10, ${label}`}>
      <div className="severity-ticks" aria-hidden="true">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="severity-tick" style={{ background: i <= score ? color : "var(--qs-n-200)" }} />
        ))}
      </div>
      <p className="num severity-label" style={{ color: ink }}>
        {score} / 10 <span className="dim">· {label}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ComparisonBar — n-bar comparison (severity contribution bars too)   */
/* ------------------------------------------------------------------ */

export interface ComparisonRow {
  name: string;
  value: number;
  tone?: "primary" | "secondary" | "pass" | "fail";
  format?: (v: number) => string;
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
  unit,
  marker,
}: {
  label: string;
  rows: ComparisonRow[];
  unit?: string;
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
          const fmt = row.format ?? ((v: number) => v.toFixed(3));
          return (
            <div key={row.name}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-n-600">{row.name}</span>
                <span className={`num text-[13px] font-semibold ${tone.text}`}>
                  {fmt(row.value)}
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
          {marker.label}: {marker.value}
        </p>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  EmptyState — friendly nothing-here card                              */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card-muted px-4 py-8 text-center">
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
/*  Field — labelled input for the New Simulation form                  */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="display text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase"
      >
        {label}
      </label>
      <div className="mt-1.5" id={id}>
        {children}
      </div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-warn">
          <Icon name="alert-triangle" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-n-500">{hint}</p>
      ) : null}
    </div>
  );
}