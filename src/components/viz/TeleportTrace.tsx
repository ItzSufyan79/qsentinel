import type { TeleportStep, TeleportTrace } from "../../api/types";
import { Chip } from "../ui/atoms";
import { AmplitudeBars } from "./AmplitudeBars";

const PAULI_COLOR: Record<TeleportStep["correction"], string> = {
  I: "var(--qs-n-400)",
  X: "var(--qs-primary)",
  Y: "var(--qs-secondary)",
  Z: "var(--qs-warn)",
};

/**
 * Teleportation, step by step. The two classical bits and the resulting Pauli
 * operator are shown side by side, because that pair is the entire reason a QDS
 * is secure: the bits disclose which error occurred, never the message.
 */
export function TeleportTrace({ trace }: { trace: TeleportTrace }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-outline pb-3">
        <span className="micro">Input state</span>
        <span className="num text-[13px] text-on-bg">{trace.inputState}</span>
        {trace.statePreserved && (
          <Chip tone="pass">
            <span className="num">state preserved</span>
          </Chip>
        )}
      </div>

      <ol className="mt-1">
        {trace.steps.map((step, i) => (
          <li key={step.index} className="relative flex gap-4 pb-4 last:pb-0">
            {/* spine + node */}
            <div className="flex shrink-0 flex-col items-center">
              <span
                className="num grid size-6 shrink-0 place-items-center border font-mono text-[10px] font-semibold"
                style={{
                  borderColor: PAULI_COLOR[step.correction],
                  color: PAULI_COLOR[step.correction],
                }}
              >
                {i + 1}
              </span>
              {i < trace.steps.length - 1 && (
                <span className="mt-1 w-px flex-1 bg-outline" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="micro">{step.stage}</span>
                <h3 className="text-[13.5px] font-semibold text-on-bg">{step.caption}</h3>
              </div>

              <p className="mt-1 text-[12.5px] leading-snug text-n-600 dark:text-n-700">
                {step.detail}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="micro">classical bits</span>
                <span className="num border border-outline-strong px-1.5 py-0.5 font-mono text-[11px] text-on-bg">
                  {step.classicalBits}
                </span>
                <span className="micro ml-1">correction</span>
                <span
                  className="num grid size-6 place-items-center border font-mono text-[11px] font-bold"
                  style={{
                    borderColor: PAULI_COLOR[step.correction],
                    color: PAULI_COLOR[step.correction],
                  }}
                  title={`Pauli ${step.correction}`}
                >
                  {step.correction}
                </span>
              </div>

              {step.amplitudes.length > 0 && (
                <div className="mt-2.5">
                  <AmplitudeBars amplitudes={step.amplitudes} height={44} showCoefficients={false} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
