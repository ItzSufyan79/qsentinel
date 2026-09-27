import type { ChannelHealthResponse } from "../../api/types";
import { Counter } from "../ui/atoms";

const CX = 150;
const CY = 152;
const RAD = 116;
const TICKS = 20; // minor divisions across 0 → 1

function polar(value: number, radius = RAD): [number, number] {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, value)));
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function arcPath(from: number, to: number): string {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  const large = Math.abs(to - from) > 0.5 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RAD} ${RAD} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function bandColor(value: number, bands: { failBelow: number; warnBelow: number }) {
  if (value < bands.failBelow) return "var(--qs-fail)";
  if (value < bands.warnBelow) return "var(--qs-warn)";
  return "var(--qs-pass)";
}

function bandName(value: number, bands: { failBelow: number; warnBelow: number }) {
  if (value < bands.failBelow) return "compromised";
  if (value < bands.warnBelow) return "unreliable";
  return "trusted";
}

/** Instrument dial: hairline frame, 20 divisions, needle, no chrome. */
export function HealthGauge({
  health,
  measuring,
}: {
  health: ChannelHealthResponse | null;
  measuring: boolean;
}) {
  const bands = health?.bands ?? { failBelow: 0.5, warnBelow: 0.8 };
  const score = health?.score ?? 0;
  const settled = !measuring && health !== null;
  const color = bandColor(score, bands);

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-[21rem] border border-outline-strong bg-surface">
        <div className="flex items-center justify-between border-b border-outline px-2.5 py-1">
          <span className="micro">ch-health</span>
          <span className="micro">{measuring || !health ? "sampling" : bandName(score, bands)}</span>
        </div>

        <svg
          viewBox="0 0 300 178"
          className="w-full"
          role="img"
          aria-label={
            health
              ? `Channel health score ${score.toFixed(2)} out of 1.00`
              : "Measuring channel health"
          }
        >
          {/* zoned track */}
          <path d={arcPath(0, bands.failBelow)} fill="none" stroke="var(--qs-fail)" strokeOpacity={0.2} strokeWidth={14} />
          <path d={arcPath(bands.failBelow, bands.warnBelow)} fill="none" stroke="var(--qs-warn)" strokeOpacity={0.2} strokeWidth={14} />
          <path d={arcPath(bands.warnBelow, 1)} fill="none" stroke="var(--qs-pass)" strokeOpacity={0.2} strokeWidth={14} />

          {/* outer hairline + divisions */}
          <path d={arcPath(0, 1)} fill="none" stroke="var(--qs-outline-strong)" strokeWidth={1} transform="translate(0 -13)" />
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const v = i / TICKS;
            const [x1, y1] = polar(v, RAD + 8);
            const [x2, y2] = polar(v, RAD + (i % 5 === 0 ? 16 : 12));
            return (
              <line
                key={v}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i % 5 === 0 ? "var(--qs-n-500)" : "var(--qs-outline-strong)"}
                strokeWidth={i % 5 === 0 ? 1.5 : 1}
              />
            );
          })}

          {/* band separators */}
          {[bands.failBelow, bands.warnBelow].map((tick) => {
            const [x1, y1] = polar(tick, RAD - 8);
            const [x2, y2] = polar(tick, RAD + 16);
            return (
              <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--qs-surface)" strokeWidth={2.5} />
            );
          })}

          {/* value arc */}
          <path
            d={arcPath(0, 1)}
            fill="none"
            stroke={color}
            strokeWidth={14}
            pathLength={100}
            style={{
              strokeDasharray: 100,
              strokeDashoffset: health ? 100 - score * 100 : 100,
              transition:
                "stroke-dashoffset var(--dur-gauge) var(--ease-out), stroke var(--dur-med) linear",
            }}
          />

          {/* needle — square hub, blunt tip */}
          <g
            style={{
              transformBox: "view-box",
              transformOrigin: `${CX}px ${CY}px`,
              transform: `rotate(${settled ? score * 180 : 0}deg)`,
              transition: measuring ? undefined : "transform var(--dur-gauge) var(--ease-out)",
              animation: measuring ? "qs-seek 1.5s var(--ease-in-out) infinite" : undefined,
            }}
          >
            <rect x={CX - 4} y={CY - 4} width={8} height={8} fill={color} opacity={0.35} />
            <line x1={CX} y1={CY} x2={CX - RAD + 10} y2={CY} stroke="var(--qs-ink)" strokeWidth={2.5} />
            <rect x={CX - RAD + 4} y={CY - 3.5} width={7} height={7} fill="var(--qs-ink)" />
          </g>
          <rect x={CX - 6} y={CY - 6} width={12} height={12} fill="var(--qs-surface)" stroke="var(--qs-ink)" strokeWidth={2.5} />

          {/* scale captions */}
          <text x={CX - RAD - 4} y={CY + 16} fontSize={10} fill="var(--qs-n-500)" fontFamily="var(--font-mono)">
            0.0
          </text>
          <text x={CX + RAD - 12} y={CY + 16} fontSize={10} fill="var(--qs-n-500)" fontFamily="var(--font-mono)">
            1.0
          </text>
        </svg>

        <div className="flex items-baseline justify-between gap-3 border-t border-outline px-2.5 py-2">
          <span className="micro">score</span>
          {measuring || !health ? (
            <span className="num text-[13px] font-semibold text-n-400">——</span>
          ) : (
            <span className="num text-[17px] leading-none font-semibold" style={{ color }}>
              <Counter value={Number(score.toFixed(2))} format={(n) => n.toFixed(2)} />
              <span className="text-[11px] text-n-400"> / 1.00</span>
            </span>
          )}
        </div>
      </div>

      {measuring && (
        <p className="micro mt-2 animate-pulse-soft">measuring channel health…</p>
      )}
    </div>
  );
}
