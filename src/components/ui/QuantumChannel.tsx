/**
 * QuantumChannel — a live, animated channel between two nodes.
 *
 * Photons (dots) flow continuously along the wire. When an attack interposes on
 * the quantum channel, an attacker node appears mid-wire and pulses, which is
 * the visual answer to "how does the attack physically happen".
 *
 * `attacking` comes from the signing endpoint, never from the attack type, so
 * a replay or a classical-tampering run correctly shows a clean channel.
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
            : "border-pass bg-pass-tint text-pass-ink"
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

export function QuantumChannel({
  attacking,
  caption,
}: {
  attacking: boolean;
  caption?: string;
}) {
  const wireRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wire = wireRef.current;
    if (!wire) return;
    const photons = [...wire.querySelectorAll<HTMLElement>("[data-photon]")];
    if (photons.length === 0) return;

    // one animation over all photons so the stagger actually staggers
    const anim = animate(photons, {
      left: ["0%", "100%"],
      duration: 2400,
      delay: stagger(400),
      loop: true,
      ease: "linear",
    });
    return () => {
      anim.cancel();
    };
  }, []);

  return (
    <div className="py-4">
      <div className="flex items-start justify-between">
        <Node label="Signer" icon="atom" tone="brand" />
        <Node label="Verifier" icon="eye" tone="pass" />
      </div>

      <div ref={wireRef} className="relative mt-3 h-10">
        {/* the wire */}
        <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-outline-strong" />

        {/* flowing photons */}
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            data-photon
            className={`absolute top-1/2 size-2 -translate-y-1/2 rounded-full ${
              attacking ? "bg-fail" : "bg-primary"
            }`}
            style={{ left: 0 }}
          />
        ))}

        {/* interposed attacker */}
        {attacking && (
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="relative grid size-9 place-items-center rounded-full border border-fail bg-fail-tint text-fail">
              <Icon name="alert-triangle" size={16} />
            </span>
          </span>
        )}
      </div>

      <p className="mt-2 text-center text-[13px] leading-relaxed text-n-500">
        {caption ??
          (attacking
            ? "An attacker is interposed on the quantum channel."
            : "Photons flowing signer → verifier, channel clean.")}
      </p>
    </div>
  );
}
