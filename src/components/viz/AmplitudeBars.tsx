import type { Amplitude } from "../../api/types";

/**
 * Amplitude bars. `probability` arrives precomputed from the backend — this
 * component positions the bars and does no arithmetic on the values.
 */
export function AmplitudeBars({
  amplitudes,
  height = 96,
  showCoefficients = true,
}: {
  amplitudes: Amplitude[];
  height?: number;
  showCoefficients?: boolean;
}) {
  if (amplitudes.length === 0) return null;

  return (
    <ul className="flex items-end gap-1.5" style={{ height }}>
      {amplitudes.map((a) => {
        const zero = a.probability === 0;
        return (
          <li key={a.label} className="group relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="num text-[9.5px] text-n-500 opacity-0 transition-opacity group-hover:opacity-100">
              {a.probability.toFixed(3)}
            </span>
            <span
              className="w-full border-b-2 transition-[height] duration-500"
              style={{
                height: `${Math.max(zero ? 0 : 3, a.probability * 100)}%`,
                borderColor: zero ? "var(--qs-outline-strong)" : "var(--qs-primary)",
                background: zero
                  ? "transparent"
                  : "color-mix(in oklab, var(--qs-primary) 14%, transparent)",
              }}
              title={`${a.label} · P = ${a.probability.toFixed(4)}`}
            />
            <span className="num text-[10px] whitespace-nowrap text-on-bg">{a.label}</span>
            {showCoefficients && (
              <span className="num text-[9px] whitespace-nowrap text-n-500">
                {a.im === 0
                  ? a.re.toFixed(3)
                  : `${a.re.toFixed(2)}${a.im < 0 ? "−" : "+"}${Math.abs(a.im).toFixed(2)}i`}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
