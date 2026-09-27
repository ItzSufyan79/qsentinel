import type { ForgeryCurve } from "../../api/types";

const W = 640;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 30, left: 52 };

/** Log scale: the curve spans ~9 orders of magnitude, so linear would flatten it. */
function toLogY(p: number, min: number) {
  const clamped = Math.max(p, min);
  return Math.log10(clamped / min) / Math.log10(1 / min);
}

/**
 * Forgery probability against block count. Every value is supplied by the
 * backend — the chart only positions points, it derives nothing.
 */
export function ForgeryCurveChart({
  curve,
  loading = false,
}: {
  curve?: ForgeryCurve;
  loading?: boolean;
}) {
  if (loading || !curve || curve.points.length === 0) {
    return <div className="skeleton h-[220px] w-full" />;
  }

  const points = [...curve.points].sort((a, b) => a.blocks - b.blocks);
  const maxBlocks = points[points.length - 1].blocks || 1;
  const minP = Math.min(...points.map((p) => p.probability), 1e-12);
  const floor = Math.pow(10, Math.floor(Math.log10(minP)));

  const x = (blocks: number) => PAD.left + (blocks / maxBlocks) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    H - PAD.bottom - toLogY(p, floor) * (H - PAD.top - PAD.bottom);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.blocks).toFixed(1)},${y(p.probability).toFixed(1)}`)
    .join(" ");

  const decades = [1, 1e-1, 1e-3, 1e-6, 1e-9, 1e-12].filter((d) => d >= floor);

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Forgery probability falls from ${points[0].probability.toExponential(2)} at ${points[0].blocks} blocks to ${points[points.length - 1].probability.toExponential(2)} at ${maxBlocks} blocks.`}
      >
        {/* decade gridlines */}
        {decades.map((d) => (
          <g key={d}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(d)}
              y2={y(d)}
              stroke="var(--qs-outline)"
              strokeWidth={1}
              strokeDasharray={d === 1 ? undefined : "2 3"}
            />
            <text
              x={PAD.left - 7}
              y={y(d) + 3}
              textAnchor="end"
              className="num"
              fontSize={9}
              fill="var(--qs-n-500)"
            >
              {d === 1 ? "1" : `1e${Math.round(Math.log10(d))}`}
            </text>
          </g>
        ))}

        {/* axis rule */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--qs-outline-strong)"
          strokeWidth={1}
        />

        {points.map((p) => (
          <text
            key={p.blocks}
            x={x(p.blocks)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            className="num"
            fontSize={9}
            fill="var(--qs-n-500)"
          >
            {p.blocks}
          </text>
        ))}

        {/* decay path */}
        <path
          d={path}
          fill="none"
          stroke="var(--qs-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <g key={`pt-${p.blocks}`}>
            <rect
              x={x(p.blocks) - 3}
              y={y(p.probability) - 3}
              width={6}
              height={6}
              fill="var(--qs-surface)"
              stroke="var(--qs-primary)"
              strokeWidth={1.5}
            />
            <title>
              {p.blocks} blocks → {p.probability.toExponential(2)} (of{" "}
              {curve.trialsPerPoint.toLocaleString("en-US")} trials)
            </title>
          </g>
        ))}

        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize={9}
          fill="var(--qs-n-500)"
          className="micro"
        >
          blocks verified
        </text>
        <text
          x={4}
          y={H / 2}
          fontSize={9}
          fill="var(--qs-n-500)"
          transform={`rotate(-90 10 ${H / 2})`}
          textAnchor="middle"
          className="micro"
        >
          forgery probability
        </text>
      </svg>

      <figcaption className="micro mt-2 leading-relaxed">
        Log scale. {curve.trialsPerPoint.toLocaleString("en-US")} forgery attempts sampled per
        point · claimed bound {curve.bound}
      </figcaption>
    </figure>
  );
}
