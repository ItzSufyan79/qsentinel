/**
 * QuantumChannel — a live, animated channel between two nodes.
 *
 * Photons (dots) flow continuously along the wire. When an attack interposes
 * on the channel, an attacker node appears mid-wire and pulses, which is the
 * visual answer to "how does the attack physically happen".
 *
 * The particle flow is driven by anime.js with a staggered loop.
 */

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { Icon } from "./atoms";

function Node({
  label,
  icon,
  tone,
}: {
  label: string;
  icon: "atom" | "eye";
  tone: "brand" | "pass";
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={`grid size-10 place-items-center rounded-full border ${
          tone === "brand"
            ? "border-primary bg-primary text-on-primary"
            : "border-pass bg-pass-tint text-pass"
        }`}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="display text-[12px] tracking-[0.06em] text-n-500 uppercase">
        {label}
      </span>
    </div>
  );
}

export function QuantumChannel({ attacking }: { attacking: boolean }) {
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const dots = dotRefs.current.filter((d): d is HTMLSpanElement => d !== null);
    const anims = dots.map((dot) =>
      animate(dot, {
        left: ["0%", "100%"],
        duration: 2200,
        delay: stagger(360),
        loop: true,
        ease: "linear",
      }),
    );
    return () => {
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <div className="py-4">
      <div className="flex items-start justify-between">
        <Node label="Signer" icon="atom" tone="brand" />
        <Node label="Verifier" icon="eye" tone="pass" />
      </div>

      <div className="relative mt-2 h-8">
        {/* the wire */}
        <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-outline-strong" />

        {/* flowing photons */}
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: 0 }}
          />
        ))}

        {/* interposed attacker */}
        {attacking && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="relative grid size-9 place-items-center rounded-full border border-fail bg-fail-tint text-fail">
              <Icon name="alert-triangle" size={16} />
              <span className="absolute inset-0 animate-ping rounded-full border border-fail" />
            </span>
          </span>
        )}
      </div>

      <p className="micro mt-1 text-center text-n-500">
        {attacking
          ? "an attacker is interposed on the channel"
          : "photons flowing signer → verifier"}
      </p>
    </div>
  );
}
