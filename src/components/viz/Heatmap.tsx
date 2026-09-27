import { Caption, Tooltip } from "../ui/atoms";
import { Icon } from "../ui/Icon";

/** Page 5 §6.4 — 63-cell error-density grid. Light = untouched, dark = affected. */
export function Heatmap({ values }: { values: number[] }) {
  const mix = (v: number) =>
    `color-mix(in oklab, var(--qs-fail) ${(Math.min(1, Math.max(0, v)) * 88).toFixed(1)}%, var(--qs-surface))`;

  return (
    <div>
      <div
        className="grid gap-[2px] border border-outline-strong bg-surface p-2"
        style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label="Per-block error density across the encoded message"
      >
        {values.map((value, i) => (
          <Tooltip
            key={i}
            content={`Position ${i + 1}: ${Math.round(value * 100)}% error density`}
          >
            <span
              className="block aspect-square transition-colors duration-300"
              style={{
                background: mix(value),
                transitionDelay: `${i * 6}ms`,
                outline: value > 0.7 ? "1px solid var(--qs-fail)" : "none",
                outlineOffset: "-1px",
              }}
            />
          </Tooltip>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-outline pt-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-16 border border-outline-strong"
            style={{
              background:
                "linear-gradient(90deg, var(--qs-surface), color-mix(in oklab, var(--qs-fail) 88%, var(--qs-surface)))",
            }}
          />
          <span className="micro">few errors → many</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 bg-fail" />
          <span className="micro">high-density block</span>
        </span>
        <Tooltip content="Hashed from backend error counts — thresholds are never hard-coded in the UI.">
          <span className="inline-flex items-center gap-1 text-n-500">
            <Icon name="info" size={13} />
          </span>
        </Tooltip>
      </div>

      <Caption id="p5-heatmap" className="mt-3" />
    </div>
  );
}
