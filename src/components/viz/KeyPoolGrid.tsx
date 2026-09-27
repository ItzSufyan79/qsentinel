import type { KeygenResponse } from "../../api/types";
import { Counter, Tooltip } from "../ui/atoms";
import { Icon } from "../ui/Icon";

/** Section B — bags filling in. One cell per bag: 63 positions × 2 bags. */
export function KeyPoolGrid({
  meta,
  created,
  total,
  done,
}: {
  meta: KeygenResponse | null;
  created: number;
  total: number;
  done: boolean;
}) {
  const cells = meta ? meta.codewordPositions * meta.bagsPerPosition : 126;
  const progress = total > 0 ? created / total : 0;
  const filledCount = Math.floor(progress * cells);

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="micro">key pool · filling</span>
        <span className="num text-[12px] font-semibold text-n-600 dark:text-n-700">
          <Counter value={created} />
          <span className="text-n-400"> / <Counter value={total} /></span>
        </span>
      </div>

      <div
        className="grid gap-[2px] border border-outline-strong bg-surface p-2"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(9px, 1fr))",
        }}
        aria-hidden
      >
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            className="aspect-square transition-colors duration-300"
            style={{
              background:
                i < filledCount
                  ? done
                    ? "var(--qs-pass)"
                    : "var(--qs-primary)"
                  : "var(--qs-n-200)",
              transitionDelay: `${(i % 24) * 8}ms`,
            }}
          />
        ))}
      </div>

      {/* static explainer: the pool's multiplication, as an equation */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-outline pt-3">
        <Tooltip content="How the key pool is organised">
          <span className="micro inline-flex items-center gap-1 text-primary">
            <Icon name="info" size={13} />
            layout
          </span>
        </Tooltip>
        <Factor n={meta?.codewordPositions} label="positions" />
        <Op />
        <Factor n={meta?.bagsPerPosition} label="bags" />
        <Op />
        <Factor n={meta?.slotsPerBlock} label="slots" />
        <span className="num text-[13px] font-semibold text-n-500">=</span>
        <span className="border border-primary/40 bg-[color-mix(in_oklab,var(--qs-primary)_9%,transparent)] px-2.5 py-1.5">
          <span className="num text-[12px] font-semibold text-primary">
            <Counter value={meta?.totalSlots ?? 0} />
          </span>
          <span className="micro ml-1.5">slots</span>
        </span>
      </div>
    </div>
  );
}

function Factor({ n, label }: { n: number | undefined; label: string }) {
  return (
    <span className="border border-outline bg-surface-2 px-2.5 py-1.5">
      <span className="num text-[12px] font-semibold text-on-bg">{n ?? "—"}</span>
      <span className="micro ml-1.5">{label}</span>
    </span>
  );
}

function Op() {
  return <span className="num text-[12px] font-semibold text-n-400">×</span>;
}
