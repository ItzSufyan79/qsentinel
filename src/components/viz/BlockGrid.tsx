import type { BlockResult, VerifierResult } from "../../api/types";
import { Counter, Stamp, Tooltip } from "../ui/atoms";

function cellStyle(block: BlockResult | null): string {
  if (!block) return "skeleton";
  return block.status === "pass" ? "bg-pass" : "bg-fail";
}

function tooltipFor(index: number, block: BlockResult): string {
  const verdict = block.status === "pass" ? "PASS" : "FAIL";
  return `Block ${index + 1}: ${block.mismatches}/${block.slotCount} mismatches · threshold ${block.threshold} → ${verdict}`;
}

export function BlockGrid({
  result,
  blocks,
}: {
  result: VerifierResult;
  blocks: (BlockResult | null)[];
}) {
  const decided = result.verdict !== "pending";

  return (
    <div className="card flex flex-col p-4">
      <header className="mb-3 flex items-start justify-between gap-2 border-b border-outline pb-2.5">
        <div className="min-w-0">
          <p className="micro">
            unit {result.name[0]}·{result.name.slice(1)}
          </p>
          <h3 className="mt-1.5 font-mono text-[13px] font-semibold tracking-[0.1em] text-on-bg uppercase">
            {result.name}
          </h3>
        </div>
        <span className="num shrink-0 text-[11px] font-semibold text-n-500">
          <Counter value={result.checked} />
          <span className="text-n-500">/{result.total}</span>
        </span>
      </header>

      <div
        className="grid gap-[3px] p-[3px] outline outline-1 outline-offset-[-1px] outline-outline"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }}
        role="img"
        aria-label={`${result.name}: ${result.checked} of ${result.total} blocks checked, ${result.failed} failed`}
      >
        {blocks.map((block, i) => {
          const body = (
            <span
              className={`block aspect-square transition-all duration-200 ${cellStyle(block)}`}
              style={{
                transitionDelay: block ? "0ms" : `${(i % 8) * 40}ms`,
              }}
            />
          );
          return block ? (
            <Tooltip key={i} content={tooltipFor(i, block)}>
              {body}
            </Tooltip>
          ) : (
            <span key={i}>{body}</span>
          );
        })}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="micro">checked</span>
        <span className="num text-[11px] font-semibold text-on-bg">
          {result.checked}
          <span className="text-n-500">/{result.total}</span>
        </span>
        <span className="micro">failed</span>
        <span
          className="num text-[11px] font-semibold"
          style={{ color: result.failed ? "var(--qs-fail)" : "var(--qs-pass)" }}
        >
          {result.failed}
        </span>
      </div>

      <div className="mt-3.5">
        {!decided ? (
          <div className="skeleton h-16 w-full" aria-label="Verdict pending" />
        ) : result.verdict === "accepted" ? (
          <Stamp
            tone="pass"
            title="Accepted"
            sub={`failed blocks ${result.failed}/${result.total}`}
            animate={false}
          />
        ) : (
          <Stamp
            tone="fail"
            title="Rejected"
            sub={`failed blocks ${result.failed}/${result.total}`}
            animate={false}
          />
        )}
      </div>
    </div>
  );
}
