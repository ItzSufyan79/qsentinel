import type {
  AttackId,
  FingerprintAxis,
  FingerprintLegendEntry,
} from "../../api/types";
import { Tooltip } from "../ui/atoms";

const mix = (v: number) =>
  `color-mix(in oklab, var(--qs-fail) ${(Math.min(1, Math.max(0, v)) * 88).toFixed(1)}%, var(--qs-surface))`;

/** Page 5 §6.3 — three plain-labelled bars plus a "what each attack looks like" legend. */
export function FingerprintChart({
  axes,
  legend,
  currentAttack,
}: {
  axes: FingerprintAxis[];
  legend: FingerprintLegendEntry[];
  currentAttack: AttackId;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        {axes.map((axis) => (
          <div key={axis.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-medium text-on-bg">{axis.label}</span>
              <span className="num text-[13px] font-semibold text-fail">
                {axis.value.toFixed(2)}
              </span>
            </div>
            <div className="relative h-4 border border-outline-strong bg-surface-2">
              <div
                className="h-full transition-[width] duration-700 ease-flow"
                style={{
                  width: `${Math.round(axis.value * 100)}%`,
                  background: mix(axis.value),
                }}
              />
              {/* 0.50 and 1.00 division marks */}
              <span className="absolute inset-y-0 left-1/2 w-px bg-outline-strong" />
              <span className="absolute inset-y-0 right-0 w-px bg-outline-strong" />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="num text-[10px] text-n-500">0.00</span>
              <span className="num text-[10px] text-n-500">0.50</span>
              <span className="num text-[10px] text-n-500">1.00</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="micro mb-2">known attack patterns</p>
        <ul className="grid gap-1.5">
          {legend.map((entry) => {
            const active = entry.attackId === currentAttack;
            return (
              <li
                key={entry.attackId}
                className={`flex items-center gap-3 border px-3 py-2 transition-colors ${
                  active
                    ? "border-ink bg-[color-mix(in_oklab,var(--qs-ink)_6%,transparent)]"
                    : "border-outline"
                }`}
              >
                <span
                  className={`micro ${active ? "text-on-bg" : ""}`}
                >
                  {entry.label}
                </span>
                <span className="ml-auto flex items-end gap-1.5" aria-hidden>
                  {entry.pattern.map((value, i) => (
                    <Tooltip key={i} content={`Test Type ${["A", "B", "C"][i]}: ${value.toFixed(2)}`}>
                      <span
                        className="block w-4"
                        style={{
                          height: `${8 + value * 22}px`,
                          background: mix(value),
                          outline: active ? "1px solid var(--qs-primary)" : "none",
                          outlineOffset: "-1px",
                        }}
                      />
                    </Tooltip>
                  ))}
                </span>
                {active && <span className="chip chip-brand">this run</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
