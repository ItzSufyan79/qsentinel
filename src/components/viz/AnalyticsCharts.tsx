import type { AnalyticsPoint, BarComparison } from "../../api/types";
import { Skeleton } from "../ui/atoms";

const W = 360;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 38, left: 44 };

/** Page 5 §6.6 — detection vs false alarm curve. All points supplied by the backend. */
export function RocChart({
  points,
  axis,
  loading,
}: {
  points: AnalyticsPoint[];
  axis: { x: string; y: string };
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-[220px] w-full" />;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + x * plotW;
  const sy = (y: number) => PAD.top + (1 - y) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
  const area = points.length
    ? `${path} L ${sx(points[points.length - 1]!.x)} ${PAD.top + plotH} L ${sx(points[0]!.x)} ${PAD.top + plotH} Z`
    : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`${axis.y} versus ${axis.x}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} y1={sy(t)} x2={PAD.left + plotW} y2={sy(t)}
            stroke="var(--qs-outline)" strokeWidth={1} strokeDasharray={t === 0 ? "0" : "3 5"} />
          <text x={PAD.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={10}
            fill="var(--qs-n-500)" fontFamily="var(--font-mono)">{t.toFixed(2)}</text>
          <line x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + plotH}
            stroke="var(--qs-outline)" strokeWidth={1} strokeDasharray="3 5" />
          <text x={sx(t)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10}
            fill="var(--qs-n-500)" fontFamily="var(--font-mono)">{t.toFixed(2)}</text>
        </g>
      ))}

      <path d={area} fill="var(--qs-primary)" fillOpacity={0.1} />
      <path d={path} fill="none" stroke="var(--qs-primary)" strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <rect key={i} x={sx(p.x) - 2.75} y={sy(p.y) - 2.75} width={5.5} height={5.5}
          fill="var(--qs-surface)" stroke="var(--qs-primary)" strokeWidth={2} />
      ))}

      {/* plot frame with corner registration ticks */}
      <path
        d={`M ${PAD.left} ${PAD.top} H ${PAD.left + plotW} V ${PAD.top + plotH} H ${PAD.left} Z`}
        fill="none" stroke="var(--qs-outline-strong)" strokeWidth={1}
      />

      <text x={PAD.left + plotW / 2} y={H - 6} textAnchor="middle" fontSize={10}
        letterSpacing={1.2} fill="var(--qs-n-500)" fontFamily="var(--font-mono)">{axis.x.toUpperCase()}</text>
      <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={10}
        letterSpacing={1.2} fill="var(--qs-n-500)" fontFamily="var(--font-mono)"
        transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>{axis.y.toUpperCase()}</text>
    </svg>
  );
}

/** Page 5 §6.6 — this run vs expected honest vs expected attack. */
export function BarCompare({
  data,
  loading,
}: {
  data: BarComparison;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-[220px] w-full" />;

  const colors = ["var(--qs-primary)", "var(--qs-pass)", "var(--qs-fail)"];

  return (
    <div className="border border-outline-strong bg-surface p-3">
      <div className="flex h-[200px] items-end gap-3">
        {data.labels.map((label, i) => {
          const value = data.values[i] ?? 0;
          return (
            <div key={label} className="flex h-full flex-1 flex-col justify-end gap-1.5">
              <span className="num text-center text-[11px] font-semibold text-on-bg">
                {value.toFixed(2)}
              </span>
              <div
                className="w-full transition-[height] duration-700 ease-flow"
                style={{
                  height: `${Math.max(3, Math.round(value * 100))}%`,
                  background: colors[i] ?? "var(--qs-n-400)",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* baseline + 1.00 cap rule */}
      <div className="mt-1.5 flex gap-3 border-t border-outline-strong pt-2">
        {data.labels.map((label, i) => (
          <span key={label} className="flex-1 text-center">
            <span className="micro block leading-tight">
              <span
                className="mr-1 inline-block size-1.5 align-middle"
                style={{ background: colors[i] ?? "var(--qs-n-400)" }}
              />
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
