import { useState } from "react";
import { useFlow } from "../../state/flowStore";
import { Icon } from "../ui/Icon";

export function SkipButton() {
  const running = useFlow((s) => s.running);
  const fastForward = useFlow((s) => s.fastForward);
  const skip = useFlow((s) => s.skip);

  if (!running) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
      <button
        type="button"
        onClick={skip}
        disabled={fastForward}
        className="btn btn-sm pointer-events-auto border-outline-strong bg-surface text-on-bg"
      >
        <Icon name="fastForward" size={13} />
        {fastForward ? "Fast-forwarding" : "Skip · S"}
      </button>
    </div>
  );
}

export function RestartControl() {
  const restart = useFlow((s) => s.restart);
  return (
    <button
      type="button"
      onClick={restart}
      className="font-mono text-[10px] font-semibold tracking-[0.1em] text-n-500 uppercase transition-colors hover:text-fail"
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon name="rotate" size={12} />
        Restart
      </span>
    </button>
  );
}

/** Demo-only switch so the FAIL branch of the channel check is reachable live. */
export function DemoControls() {
  const [open, setOpen] = useState(false);
  const forceFail = useFlow((s) => s.forceChannelFail);
  const setForceFail = useFlow((s) => s.setForceChannelFail);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-n-500 uppercase transition-colors hover:text-accent-ink"
      >
        <Icon name="zap" size={12} />
        Demo
      </button>
      {open && (
        <div className="animate-pop absolute right-0 bottom-full z-50 mb-2 w-64 border border-outline-strong bg-surface p-3">
          <p className="micro mb-2">Force channel health</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setForceFail(false)}
              className={`flex-1 border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase transition ${
                !forceFail
                  ? "border-pass bg-pass text-white"
                  : "border-outline text-n-500 hover:border-pass"
              }`}
            >
              Pass
            </button>
            <button
              type="button"
              onClick={() => setForceFail(true)}
              className={`flex-1 border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase transition ${
                forceFail
                  ? "border-fail bg-fail text-white"
                  : "border-outline text-n-500 hover:border-fail"
              }`}
            >
              Fail
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-n-500">
            Applies on the next run. A failed channel deliberately blocks the flow —
            only Restart is offered.
          </p>
        </div>
      )}
    </div>
  );
}
