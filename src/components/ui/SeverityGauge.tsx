import { animate } from "animejs";
import { useEffect, useRef } from "react";
import { useCountUp } from "../../lib/useCountUp";

/**
 * Circular severity gauge. The arc fills and the number counts up via
 * anime.js. Colour follows the score: teal (low) → amber (medium) → red
 * high. Red is reserved for genuinely severe verdicts, per the design rules.
 */
export function SeverityGauge({ score }: { score: number }) {
  const animated = useCountUp(score, 1100);
  const arcRef = useRef<SVGCircleElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    clamped >= 70 ? "fail" : clamped >= 35 ? "warn" : "pass";
  const stroke =
    tone === "fail" ? "var(--qs-fail)" : tone === "warn" ? "var(--qs-warn)" : "var(--qs-pass)";

  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);

  useEffect(() => {
    if (!arcRef.current) return;
    const arc = arcRef.current;
    const state = { off: circumference };
    const anim = animate(state, {
      off: offset,
      duration: 1100,
      ease: "outExpo",
      onUpdate: () => {
        arc.style.strokeDashoffset = String(state.off);
      },
    });
    return () => {
      anim.cancel();
    };
  }, [offset]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Severity score ${clamped} out of 100`}>
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="var(--qs-n-200)"
            strokeWidth="10"
          />
          <circle
            ref={arcRef}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke 300ms linear" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            ref={textRef}
            className="num text-[34px] leading-none font-semibold"
            style={{ color: stroke }}
          >
            {Math.round(animated)}
          </span>
          <span className="micro mt-1 text-n-500">/ 100</span>
        </div>
      </div>
      <p className="micro mt-3" style={{ color: stroke }}>
        {clamped >= 70 ? "severe" : clamped >= 35 ? "elevated" : "low"}
      </p>
    </div>
  );
}
