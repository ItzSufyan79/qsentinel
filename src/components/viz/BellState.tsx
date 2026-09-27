import type { BellStateResponse } from "../../api/types";
import { Chip } from "../ui/atoms";
import { AmplitudeBars } from "./AmplitudeBars";

/**
 * Bell-state entanglement. The amplitude bars show the state; the correlation
 * figure is the evidence that the entanglement is real rather than asserted.
 * Both numbers come from the backend.
 */
export function BellState({ bell }: { bell: BellStateResponse }) {
  return (
    <div>
      <p className="num border-l-2 border-primary pl-3 font-mono text-[15px] text-on-bg">
        {bell.formula}
      </p>
      <p className="mt-1.5 pl-3 text-[12.5px] text-n-500">{bell.label}</p>

      <div className="mt-5">
        <p className="micro mb-2">State amplitudes</p>
        <AmplitudeBars amplitudes={bell.amplitudes} />
      </div>

      <div className="mt-5 border-t border-outline pt-3">
        <p className="micro mb-2">Entanglement evidence</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[24px] leading-none font-semibold tracking-tight text-on-bg">
            {(bell.correlationAgreement * 100).toFixed(2)}%
          </span>
          <Chip tone={bell.correlationAgreement > 0.99 ? "pass" : "warn"}>
            correlated
          </Chip>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-n-600 dark:text-n-700">
          Measured pairs agreed on{" "}
          <span className="num">{bell.correlationTrials.toLocaleString("en-US")}</span>{" "}
          trials. A non-entangled pair would agree about half the time — this is the
          difference between 50% and{" "}
          <span className="num">{(bell.correlationAgreement * 100).toFixed(0)}%</span> that
          entanglement buys.
        </p>
      </div>
    </div>
  );
}
