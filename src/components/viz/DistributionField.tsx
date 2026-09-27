import type { VerifierTarget } from "../../api/types";
import { Counter, ProgressBar, Tooltip } from "../ui/atoms";
import { Icon } from "../ui/Icon";

/**
 * Section C — Alice teleports an independent copy to each verifier.
 * Lines only ever run outward: never verifier → verifier (spec §Section C).
 * Drawn as a wiring schematic, not a node graph.
 */
export function DistributionField({
  targets,
  done,
  fast,
}: {
  targets: VerifierTarget[];
  done: boolean;
  fast: boolean;
}) {
  const rows = targets.length;
  const height = Math.max(210, rows * 84 + 56);
  const aliceY = height / 2;
  const aliceX = 84;
  const nodeX = 470;

  const nodeY = (i: number) =>
    rows === 1 ? aliceY : 52 + (i * (height - 104)) / (rows - 1);

  const duration = fast ? "0.3s" : "1.9s";

  return (
    <div className="w-full">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="micro">key distribution · outward only</span>
        <Tooltip
          content="Each verifier receives their own separate copy — sent independently, not passed between them."
          side="bottom"
        >
          <span className="chip chip-neutral">
            <Icon name="info" size={12} />
            independent copies
          </span>
        </Tooltip>
      </div>

      <div className="border border-outline-strong bg-surface">
        <svg viewBox={`0 0 580 ${height}`} className="w-full" role="img"
          aria-label={`Key distribution from Alice to ${rows} verifier${rows === 1 ? "" : "s"}`}>
          {/* schematic grid */}
          <g opacity={0.5}>
            {Array.from({ length: rows + 1 }, (_, i) => {
              const y = nodeY(Math.min(i, rows - 1));
              return (
                <line key={`h${i}`} x1={20} y1={y} x2={560} y2={y} stroke="var(--qs-outline)" strokeWidth={1} />
              );
            })}
          </g>

          {/* wires — always dashed, hairline */}
          {targets.map((target, i) => (
            <line
              key={target.name}
              x1={aliceX + 30}
              y1={aliceY}
              x2={nodeX - 28}
              y2={nodeY(i)}
              stroke={target.done ? "var(--qs-pass)" : "var(--qs-outline-strong)"}
              strokeWidth={1.5}
              strokeDasharray="4 6"
            />
          ))}

          {/* packets */}
          {!done &&
            targets.map((target, i) => {
              const y2 = nodeY(i);
              const path = `M ${aliceX + 30},${aliceY} L ${nodeX - 28},${y2}`;
              return [0, 0.33, 0.66].map((offset) => (
                <rect key={`${target.name}-${offset}`} width={7} height={7} fill="var(--qs-primary)">
                  <animateMotion
                    dur={duration}
                    path={path}
                    begin={`${offset + i * 0.12}s`}
                    repeatCount="indefinite"
                  />
                </rect>
              ));
            })}

          {/* Alice — square source block */}
          <g>
            <rect
              x={aliceX - 30}
              y={aliceY - 30}
              width={60}
              height={60}
              fill="var(--qs-primary)"
            />
            <rect
              x={aliceX - 36}
              y={aliceY - 36}
              width={72}
              height={72}
              fill="none"
              stroke="var(--qs-primary)"
              strokeOpacity={0.35}
              strokeDasharray="3 4"
            />
            <text x={aliceX} y={aliceY + 6} textAnchor="middle" fontSize={16} fontWeight={700}
              fill="var(--qs-on-primary)" fontFamily="var(--font-mono)">A</text>
            <text x={aliceX} y={aliceY + 54} textAnchor="middle" fontSize={10} fontWeight={600}
              fill="var(--qs-on-bg)" fontFamily="var(--font-mono)" letterSpacing={1.4}>ALICE</text>
            <text x={aliceX} y={aliceY + 68} textAnchor="middle" fontSize={9}
              fill="var(--qs-n-500)" fontFamily="var(--font-mono)" letterSpacing={1}>SENDER</text>
          </g>

          {/* verifiers — square nodes with registration corners */}
          {targets.map((target, i) => {
            const y = nodeY(i);
            const pct = target.total > 0 ? target.received / target.total : 0;
            const complete = target.done;
            return (
              <g key={target.name}>
                <rect
                  x={nodeX - 24}
                  y={y - 24}
                  width={48}
                  height={48}
                  fill="var(--qs-surface)"
                  stroke={complete ? "var(--qs-pass)" : "var(--qs-outline-strong)"}
                  strokeWidth={2}
                />
                <rect
                  x={nodeX - 24}
                  y={y - 24}
                  width={12}
                  height={12}
                  fill={complete ? "var(--qs-pass)" : "var(--qs-n-200)"}
                />
                <text x={nodeX} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700}
                  fill="var(--qs-on-bg)" fontFamily="var(--font-mono)">
                  {target.name[0]}
                </text>
                <text x={nodeX + 38} y={y - 2} fontSize={11} fontWeight={600}
                  fill="var(--qs-on-bg)" fontFamily="var(--font-mono)" letterSpacing={0.8}>
                  {target.name.toUpperCase()}
                </text>
                <text x={nodeX + 38} y={y + 14} fontSize={10}
                  fill="var(--qs-n-500)" fontFamily="var(--font-mono)">
                  {complete ? "COMPLETE" : `${Math.round(pct * 100)}%`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* per-verifier counters */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {targets.map((target) => (
          <div key={target.name} className="border border-outline bg-surface-2 px-3 py-2.5">
            <ProgressBar
              value={target.total > 0 ? target.received / target.total : 0}
              tone={target.done ? "pass" : "brand"}
              label={target.name}
              right={
                <span>
                  <Counter value={target.received} />
                  <span className="text-n-500"> / <Counter value={target.total} /></span>
                </span>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
