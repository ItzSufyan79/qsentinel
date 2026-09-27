import { useEffect, useRef, useState } from "react";
import { Tooltip } from "../ui/atoms";
import { Icon } from "../ui/Icon";

function instantReveal(): boolean {
  return (
    document.documentElement.style.getPropertyValue("--motion-scale") !== "1" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The 63 cells. Remounts per message (keyed) so each encode animates once. */
function BitCells({ encoded }: { encoded: string }) {
  const [revealed, setRevealed] = useState(() =>
    instantReveal() ? encoded.length : 0,
  );
  const counter = useRef(instantReveal() ? encoded.length : 0);

  useEffect(() => {
    if (counter.current >= encoded.length) return;
    const timer = window.setInterval(() => {
      counter.current += 1;
      setRevealed(counter.current);
      if (counter.current >= encoded.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [encoded]);

  const done = revealed >= encoded.length;
  const ones = Array.from(encoded).slice(0, revealed).filter((b) => b === "1").length;

  return (
    <div className="relative border border-outline-strong bg-surface p-3">
      {!done && (
        <span
          aria-hidden
          className="animate-scan pointer-events-none absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--qs-primary)_26%,transparent)] to-transparent"
        />
      )}

      {/* position ruler: 1 / 8 / 16 … 64 */}
      <div
        aria-hidden
        className="mb-1 flex justify-between font-mono text-[10px] tracking-[0.1em] text-n-500"
      >
        <span>01</span>
        <span>16</span>
        <span>32</span>
        <span>48</span>
        <span>{encoded.length}</span>
      </div>

      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${encoded.length}, minmax(0, 1fr))` }}
      >
        {Array.from(encoded).map((bit, i) => {
          const shown = i < revealed;
          const isOne = bit === "1";
          return (
            <div key={i} className="flex flex-col items-stretch gap-[2px]">
              <span
                className="grid aspect-square place-items-center font-mono text-[9px] leading-none font-bold transition-all duration-200"
                style={{
                  background: shown
                    ? isOne
                      ? "var(--qs-secondary-variant)"
                      : "var(--qs-primary)"
                    : "var(--qs-n-200)",
                  color: shown
                    ? isOne
                      ? "var(--qs-on-secondary)"
                      : "var(--qs-on-primary)"
                    : "transparent",
                }}
              >
                {/* 64 cells across a phone is ~5px each — the tile colour is
                    the signal there, and the sr-only summary carries the text. */}
                <span className="hidden sm:inline">{shown ? bit : ""}</span>
              </span>
              <span
                className="block h-[5px] transition-colors duration-300"
                style={{
                  background: shown && !isOne ? "var(--qs-primary)" : "transparent",
                  outline: shown && !isOne ? "none" : "1px solid var(--qs-outline)",
                  outlineOffset: "-1px",
                }}
              />
              <span
                className="block h-[5px] transition-colors duration-300"
                style={{
                  background: shown && isOne ? "var(--qs-secondary-variant)" : "transparent",
                  outline: shown && isOne ? "none" : "1px solid var(--qs-outline)",
                  outlineOffset: "-1px",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-outline pt-2">
        <span className="micro inline-flex items-center gap-1.5">
          <span className="inline-block size-2 bg-primary" /> 0 box
        </span>
        <span className="micro inline-flex items-center gap-1.5">
          <span className="inline-block size-2 bg-secondary-variant" /> 1 box
        </span>
        <span className="num ml-auto text-[10px] font-semibold text-n-500">
          {revealed}/{encoded.length} positions · {ones} ones
        </span>
      </div>

      <span className="sr-only">
        {revealed} of {encoded.length} positions encoded
      </span>
    </div>
  );
}

/** Page 2 — 63-bit encoding + per-position block selection animation. */
export function BitRow({ encoded }: { encoded: string }) {
  if (!encoded) return null;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="micro">
          protected format · {encoded.length} positions
        </p>
        <Tooltip content="This extra encoding makes sure that even a single-character change in the message will be very obviously different — like a checksum.">
          <span className="text-accent-ink">
            <Icon name="info" size={14} />
          </span>
        </Tooltip>
      </div>

      <BitCells key={encoded} encoded={encoded} />
    </div>
  );
}
