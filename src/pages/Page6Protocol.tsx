import { useEffect } from "react";
import { useFlow } from "../state/flowStore";
import { Banner, Panel, Skeleton } from "../components/ui/atoms";
import { BellState } from "../components/viz/BellState";
import { ForgeryCurveChart } from "../components/viz/ForgeryCurveChart";
import { MeasurementHistogram } from "../components/viz/MeasurementHistogram";
import { TeleportTrace } from "../components/viz/TeleportTrace";

function Absent({ what }: { what: string }) {
  return (
    <div className="border border-dashed border-outline-strong p-4">
      <p className="micro">Not provided by this backend</p>
      <p className="mt-1.5 text-[13px] leading-snug text-n-600 dark:text-n-700">
        {what} is one of the three optional protocol endpoints. The rest of the run is
        unaffected — this section simply has nothing to draw.
      </p>
    </div>
  );
}

export function Page6Protocol() {
  const loadProtocol = useFlow((s) => s.loadProtocol);
  const stage = useFlow((s) => s.protocolStage);
  const protocol = useFlow((s) => s.protocol);
  const report = useFlow((s) => s.report);

  useEffect(() => {
    if (stage === "idle") void loadProtocol();
  }, [loadProtocol, stage]);

  const loading = stage === "running";
  const nothingAtAll =
    stage === "done" &&
    !protocol.bell &&
    !protocol.teleport &&
    protocol.measurements.length === 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6">
      <div className="flex flex-wrap items-end gap-3 border-b border-outline-strong pb-3">
        <div className="mr-auto">
          <p className="micro">§8 · protocol primitives</p>
          <h1 className="mt-1.5 font-mono text-xl font-semibold tracking-[0.14em] text-on-bg uppercase">
            Quantum Protocol
          </h1>
        </div>
        <p className="micro max-w-xs text-right leading-relaxed">
          The four primitives the problem statement names, made visible.
        </p>
      </div>

      {nothingAtAll && (
        <Banner tone="warn" title="This backend provides no protocol data">
          The five-stage run is complete, but the optional protocol endpoints are absent.
          Ask the backend team for <code className="font-mono text-[11px]">/protocol/bell</code>,{" "}
          <code className="font-mono text-[11px]">/protocol/teleport</code> and{" "}
          <code className="font-mono text-[11px]">/protocol/measure</code>.
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          kicker="§8.1"
          title="Bell-State Entanglement"
          subtitle="A pair that cannot be described independently"
        >
          {loading ? <Skeleton className="h-72 w-full" /> : protocol.bell ? (
            <BellState bell={protocol.bell} />
          ) : (
            <Absent what="Bell-state entanglement" />
          )}
        </Panel>

        <Panel
          kicker="§8.2"
          title="Quantum Teleportation"
          subtitle="State moved without ever being copied"
        >
          {loading ? <Skeleton className="h-96 w-full" /> : protocol.teleport ? (
            <TeleportTrace trace={protocol.teleport} />
          ) : (
            <Absent what="The teleportation trace" />
          )}
        </Panel>

        <Panel
          kicker="§8.3"
          title="Projective Measurement"
          subtitle="Observed counts against the distribution an honest run must produce"
          className="lg:col-span-2"
        >
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : protocol.measurements.length > 0 ? (
            <>
              <MeasurementHistogram series={protocol.measurements} />
              <p className="micro mt-4 border-t border-outline pt-3 leading-relaxed">
                The grey tick on each bar is the expected count. Deviation and verdict are
                computed by the backend — the threshold rule reads them, the UI does not.
              </p>
            </>
          ) : (
            <Absent what="The measurement series" />
          )}
        </Panel>

        <Panel
          kicker="§8.4"
          title="Forgery Probability"
          subtitle="The PS evaluation criterion, in one chart"
          className="lg:col-span-2"
        >
          <ForgeryCurveChart curve={report?.forgeryCurve} loading={loading} />
        </Panel>
      </div>

      <Banner tone="brand" title="Read this before asking questions">
        A classical signature is copied, so copying it is undetectable. A quantum
        signature destroys itself when observed, and the Pauli correction restores it at
        the receiver — that is why forging one is exponentially harder than making a
        valid one.
      </Banner>
    </div>
  );
}
