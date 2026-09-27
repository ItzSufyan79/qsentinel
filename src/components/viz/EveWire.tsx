import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AttackResponse } from "../../api/types";
import { Icon } from "../ui/Icon";

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const TRAVEL: Record<AttackResponse["visualization"], string> = {
  idle: "qs-recolor-idle",
  grab: "qs-recolor-grab",
  swap: "qs-recolor-swap",
  alter: "qs-recolor-alter",
  reuse: "qs-recolor-reuse",
};

/** Page 3 §B — a packet travels Alice → Eve → verifiers, changing as it passes Eve. */
export function EveWire({
  attack,
  verifiers,
}: {
  attack: AttackResponse | null;
  verifiers: string[];
}) {
  const wireRef = useRef<HTMLDivElement | null>(null);
  const [wireLen, setWireLen] = useState(0);

  useEffect(() => {
    const node = wireRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWireLen(Math.max(0, entry.contentRect.width - 14));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hostile = attack !== null && attack.attackId !== "none";

  const packetStyle: CSSVars = {
    background: "var(--qs-primary)",
    animation: `qs-travel 2.6s linear infinite, ${TRAVEL[attack?.visualization ?? "idle"]} 2.6s linear infinite`,
    "--wire-len": `${wireLen}px`,
  };

  return (
    <div className="border border-outline-strong bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline px-3 py-1.5">
        <span className="micro">signal path</span>
        <span className={`chip ${hostile ? "chip-fail" : "chip-pass"}`}>
          <span className={`size-1.5 ${hostile ? "bg-fail" : "bg-pass"}`} />
          {hostile ? (attack?.label ?? "attack active") : "channel clear"}
        </span>
      </div>

      <div className="flex items-center gap-3 p-3 sm:p-4">
        {/* sender */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="grid size-11 place-items-center bg-primary font-mono text-[15px] font-bold text-on-primary">
            A
          </span>
          <span className="micro">alice</span>
        </div>

        {/* wire */}
        <div ref={wireRef} className="relative h-12 flex-1">
          {/* the conductor, plus a hairline centre rule */}
          <span className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-outline-strong" />
          <span
            className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2"
            style={{
              background: hostile
                ? "repeating-linear-gradient(90deg, var(--qs-fail-tint) 0 6px, transparent 6px 12px)"
                : "repeating-linear-gradient(90deg, var(--qs-pass-tint) 0 6px, transparent 6px 12px)",
            }}
          />

          {/* Eve — a tap on the line, not a hub */}
          <span
            className={`absolute top-1/2 left-1/2 z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center border-2 transition-colors duration-300 ${
              hostile
                ? "border-fail bg-[var(--qs-fail-tint)] text-fail animate-pulse-soft"
                : "border-outline-strong bg-surface text-n-500"
            }`}
            title={hostile ? "Eve — simulated attacker on the wire" : "No adversary on the wire"}
          >
            <Icon name={hostile ? "eye" : "lock"} size={16} />
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 font-mono text-[9.5px] tracking-[0.14em] text-n-500 uppercase">
              eve
            </span>
          </span>

          {/* packet */}
          <span
            aria-hidden
            className="absolute top-1/2 left-0 size-3.5 -translate-y-1/2 border border-surface outline outline-1 outline-outline-strong"
            style={wireLen > 0 ? packetStyle : { opacity: 0 }}
          />
        </div>

        {/* receivers */}
        <div className="flex flex-col gap-1">
          {verifiers.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1.5 border border-outline bg-surface px-1.5 py-1"
            >
              <span className="grid size-4 place-items-center bg-secondary-variant font-mono text-[9px] font-bold text-on-secondary">
                {name[0]}
              </span>
              <span className="micro">{name}</span>
            </span>
          ))}
        </div>
      </div>

      <p className="micro border-t border-outline px-3 py-2 leading-relaxed">
        {hostile
          ? "Watch the packet change as it passes Eve — everything outside her access panel stays unreachable."
          : "No interference on the path; the packet reaches every verifier untouched."}
      </p>
    </div>
  );
}
