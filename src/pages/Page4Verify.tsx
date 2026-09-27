import { useEffect } from "react";
import { useFlow } from "../state/flowStore";
import { Caption, Panel, SectionHead, Stamp } from "../components/ui/atoms";
import { Icon } from "../components/ui/Icon";
import { BlockGrid } from "../components/viz/BlockGrid";

export function Page4Verify() {
  const verifyStage = useFlow((s) => s.verifyStage);
  const startVerify = useFlow((s) => s.startVerify);
  const store = useFlow();

  useEffect(() => {
    if (verifyStage === "idle") void startVerify();
  }, [verifyStage, startVerify]);

  const total = store.verifierResults.length;
  const done = store.verifyStage === "done";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 sm:px-6">
      <SectionHead step="4" title="Verifier Results" state={done ? "done" : "active"}>
        <span className="num text-[11px] font-semibold text-n-500">
          {total > 0 ? `${total} units reporting` : "awaiting telemetry"}
        </span>
      </SectionHead>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {total === 0
          ? Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="card p-4">
                <div className="skeleton mb-3 h-2.5 w-24" />
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }}
                >
                  {Array.from({ length: 63 }, (_, j) => (
                    <div key={j} className="skeleton aspect-square" />
                  ))}
                </div>
                <div className="skeleton mt-3 h-11 w-full" />
              </div>
            ))
          : store.verifierResults.map((result) => (
              <BlockGrid
                key={result.name}
                result={result}
                blocks={store.blockResults[result.name] ?? []}
              />
            ))}
      </div>

      <Caption id="p4-verify" />

      <Panel kicker="§6.3" title="Cross-Verifier Agreement">
        {!store.agreement || !done ? (
          <div className="skeleton h-16 w-full max-w-md" aria-label="Agreement pending" />
        ) : store.agreement.unanimous ? (
          <Stamp
            tone={store.agreement.verdict === "accepted" ? "pass" : "fail"}
            title={`All verifiers agree · ${store.agreement.verdict.toUpperCase()}`}
            sub="independent key pools · no shared state"
          />
        ) : (
          <Stamp
            tone="fail"
            title="Verifiers disagree"
            sub={`dissenting: ${store.agreement.dissenters.join(", ")}`}
          />
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-4">
          <p className="micro max-w-xs leading-relaxed">
            Each verifier used only its own independent copy of the key pool.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!done}
            onClick={() => store.goToPage(5)}
          >
            View Full Dashboard
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </Panel>
    </div>
  );
}
