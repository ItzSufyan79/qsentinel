import { useEffect, useRef, useState, type ReactNode } from "react";
import { CAPTIONS, type CaptionId } from "../../content/captions";
import { useFlow } from "../../state/flowStore";
import { Icon, type IconName } from "./Icon";

/* ------------------------------- Chip ------------------------------- */

export type Tone = "pass" | "fail" | "warn" | "pending" | "neutral" | "brand";

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/* ------------------------------- Panel ------------------------------ */

export function Panel({
  title,
  kicker,
  subtitle,
  action,
  children,
  className = "",
  muted = false,
  plain = false,
}: {
  title?: ReactNode;
  /** small mono label above the title, e.g. "§6.2" */
  kicker?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  muted?: boolean;
  plain?: boolean;
}) {
  return (
    <section
      className={`${muted || plain ? "card-muted" : "card"} p-4 sm:p-5 ${className}`}
    >
      {(title || action) && (
        <header className="panel-head">
          <div className="min-w-0">
            {kicker && <p className="micro mb-1">{kicker}</p>}
            {title && (
              <h2 className="text-[15px] leading-tight font-semibold tracking-tight text-on-bg sm:text-base">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[12.5px] text-n-600 dark:text-n-700">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* --------------------------- SectionBand ---------------------------- */

const BAND_COLOR: Record<"pending" | "active" | "done", string> = {
  pending: "var(--qs-n-400)",
  active: "var(--qs-primary)",
  done: "var(--qs-pass)",
};

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
      <span className="idx">{state === "done" ? "✓" : step}</span>
      <span className="band-title">{title}</span>
      {children}
      <span className="band-state" style={{ color: BAND_COLOR[state] }}>
        {state}
      </span>
    </div>
  );
}

/* ---------------------------- ProgressBar --------------------------- */

const METER_COLOR: Record<Tone, string> = {
  brand: "var(--qs-primary)",
  pass: "var(--qs-pass)",
  fail: "var(--qs-fail)",
  warn: "var(--qs-warn)",
  pending: "var(--qs-pending)",
  neutral: "var(--qs-n-400)",
};

export function ProgressBar({
  value,
  tone = "brand",
  label,
  right,
}: {
  /** 0–1, straight from the backend */
  value: number;
  tone?: Tone;
  label?: ReactNode;
  right?: ReactNode;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="w-full">
      {(label || right) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="micro">{label}</span>
          <span className="num text-[11px] font-semibold text-n-600 dark:text-n-700">
            {right}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="meter"
      >
        <div
          className="meter-fill"
          style={{ width: `${pct}%`, background: METER_COLOR[tone] }}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Skeleton ---------------------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ------------------------------ Tooltip ----------------------------- */

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const placement =
    side === "top"
      ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
      : "top-full mt-2 left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex cursor-help" tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-40 w-max max-w-[17rem] border border-outline-strong bg-surface px-2.5 py-1.5 font-mono text-[10.5px] leading-snug text-on-bg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 ${placement}`}
      >
        {content}
      </span>
    </span>
  );
}

/* ------------------------------- Banner ----------------------------- */

const BANNER: Record<Tone, { accent: string; icon: IconName }> = {
  pass: { accent: "var(--qs-pass)", icon: "check" },
  fail: { accent: "var(--qs-fail)", icon: "x" },
  warn: { accent: "var(--qs-warn)", icon: "alert" },
  pending: { accent: "var(--qs-pending)", icon: "clock" },
  neutral: { accent: "var(--qs-n-400)", icon: "info" },
  brand: { accent: "var(--qs-primary)", icon: "info" },
};

export function Banner({
  tone,
  title,
  children,
  action,
  className = "",
  animate = true,
}: {
  tone: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
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
      <span style={{ color: style.accent }} className="shrink-0">
        <Icon name={style.icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="num text-[11px] font-semibold tracking-[0.1em] uppercase"
          style={{ color: style.accent }}
        >
          {title}
        </p>
        {children && (
          <p className="mt-1 text-[13px] leading-snug text-n-600 dark:text-n-700">
            {children}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------- Stamp ------------------------------ */

/** Double-ruled verdict box — the one place the verdict is allowed to shout. */
export function Stamp({
  tone,
  title,
  sub,
  className = "",
  animate = true,
}: {
  tone: "pass" | "fail";
  title: string;
  sub?: ReactNode;
  className?: string;
  animate?: boolean;
}) {
  const color = tone === "pass" ? "var(--qs-pass)" : "var(--qs-fail)";
  return (
    <div
      className={`stamp ${animate ? "animate-pop" : ""} ${className}`}
      style={{ color, background: `color-mix(in oklab, ${color} 5%, transparent)` }}
      role="status"
    >
      <Icon name={tone === "pass" ? "check" : "x"} size={20} />
      <div className="min-w-0">
        <p className="stamp-label" style={{ color }}>
          {title}
        </p>
        {sub && (
          <p className="num mt-1 text-[11px] tracking-[0.08em] text-n-600 dark:text-n-700">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Counter ----------------------------- */

export function Counter({
  value,
  format = (n: number) => n.toLocaleString("en-US"),
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | undefined>(undefined);
  const from = useRef(value);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fast =
      document.documentElement.style.getPropertyValue("--motion-scale") !== "1";

    if (reduced || fast || from.current === value) {
      from.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    const duration = 260;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(origin + delta * eased));
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        from.current = value;
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      from.current = value;
    };
  }, [value]);

  return <span className={`num ${className}`}>{format(display)}</span>;
}

/* ------------------------------ Caption ----------------------------- */

export function Caption({ id, className = "" }: { id: CaptionId; className?: string }) {
  const mode = useFlow((s) => s.explainMode);
  return (
    <p className={`caption-text flex gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="mt-[3px] h-fit shrink-0 border border-outline-strong px-1.5 py-[1px] font-mono text-[9px] font-semibold tracking-[0.12em] text-n-500 uppercase"
      >
        {mode === "simple" ? "plain" : "tech"}
      </span>
      <span>{CAPTIONS[id][mode]}</span>
    </p>
  );
}
