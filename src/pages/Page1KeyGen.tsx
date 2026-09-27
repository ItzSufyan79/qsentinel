import { useState } from "react";
import { useFlow } from "../state/flowStore";
import { caption } from "../content/captions";
import { Banner, Caption, Panel, SectionHead } from "../components/ui/atoms";
import { Icon } from "../components/ui/Icon";
import { DistributionField } from "../components/viz/DistributionField";
import { HealthGauge } from "../components/viz/HealthGauge";
import { KeyPoolGrid } from "../components/viz/KeyPoolGrid";

const ORDER = ["setup", "keygen", "distribute", "health"] as const;

export function Page1KeyGen() {
  const store = useFlow();
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const activeIndex =
    store.section === "done" ? 3 : Math.max(0, ORDER.indexOf(store.section as (typeof ORDER)[number]));

  const stateFor = (i: number): "done" | "active" =>
    store.section === "done" || i < activeIndex ? "done" : "active";

  const choose = (count: number) => {
    store.setVerifierCount(Math.min(6, Math.max(1, count)));
    setCustomOpen(false);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 sm:px-6">
      {/* ---------------- Section A ---------------- */}
      <div>
        <SectionHead step="A" title="Setup" state={stateFor(0)} />
        <Panel>
          <fieldset className="mb-5">
            <legend className="micro mb-2">How many verifiers?</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {store.init?.verifierCountOptions.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => choose(count)}
                  aria-pressed={store.verifierCount === count}
                  className={`num min-w-12 border px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    store.verifierCount === count
                      ? "border-ink bg-ink text-bg"
                      : "border-outline-strong bg-surface text-n-600 hover:border-ink hover:text-on-bg dark:text-n-700"
                  }`}
                >
                  {count}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                aria-expanded={customOpen}
                aria-label="Enter a custom verifier count"
                className={`num grid min-w-12 place-items-center border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  customOpen
                    ? "border-ink bg-ink text-bg"
                    : "border-outline-strong border-dashed text-n-500 hover:border-ink hover:text-on-bg"
                }`}
              >
                +
              </button>
              {customOpen && (
                <label className="flex items-center gap-2">
                  <span className="micro">count</span>
                  <input
                    type="number"
                    min={1}
                    max={store.init?.maxVerifiers ?? 6}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onBlur={() => custom && choose(Number(custom))}
                    onKeyDown={(e) => e.key === "Enter" && custom && choose(Number(custom))}
                    placeholder={`1–${store.init?.maxVerifiers ?? 6}`}
                    autoFocus
                    className="num w-20 border border-outline-strong bg-surface px-2 py-2 text-sm font-semibold text-on-bg focus:border-primary focus:outline-none"
                  />
                </label>
              )}
            </div>
            <p className="micro mt-2">
              cap {store.init?.maxVerifiers ?? "—"} · each verifier checks independently
            </p>
          </fieldset>

          {/* hardware profile — fixed by design */}
          <div className="card-muted flex flex-wrap items-center gap-4 border-l-[3px] border-l-n-300 p-3.5">
            <span className="grid size-8 shrink-0 place-items-center border border-outline-strong text-n-500">
              <Icon name="lock" size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-on-bg">
                {store.init?.hardwareProfile.label ?? "Loading profile…"}
                <span className="chip chip-neutral">read-only</span>
              </p>
              <p className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                {store.init?.hardwareProfile.stats.map((stat) => (
                  <span key={stat.label} className="micro">
                    {stat.label}{" "}
                    <strong className="num font-semibold text-on-bg">{stat.value}</strong>
                  </span>
                ))}
              </p>
            </div>
            <span className="micro hidden max-w-24 leading-relaxed sm:block">
              fixed by design · not user-changeable
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!store.verifierCount || store.section !== "setup"}
              onClick={store.startSimulation}
            >
              <Icon name="play" size={15} />
              Start Simulation
            </button>
            {store.verifierCount ? (
              <span className="micro">
                <span className="num font-semibold text-on-bg">{store.verifierCount}</span>{" "}
                verifier{store.verifierCount === 1 ? "" : "s"} selected
              </span>
            ) : (
              <span className="micro">pick a verifier count to continue</span>
            )}
          </div>
        </Panel>
        <Caption id="p1-setup" className="mt-3" />
      </div>

      {/* ---------------- Section B ---------------- */}
      {activeIndex >= 1 && (
        <div>
          <SectionHead step="B" title="Private Key Generation" state={stateFor(1)} />
          <Panel>
            {store.keygen ? (
              <KeyPoolGrid
                meta={store.keygenMeta}
                created={store.keygen.created}
                total={store.keygen.total}
                done={store.keygen.done}
              />
            ) : (
              <div className="skeleton h-40 w-full" />
            )}

            {store.keygen?.done && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Banner tone="pass" title="Key generation complete" animate={false}>
                  <span className="font-mono tabular">
                    {store.keygen.total.toLocaleString("en-US")} slots ready
                  </span>
                </Banner>
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!store.keygen?.done || store.section !== "keygen"}
                onClick={store.toDistribute}
              >
                Next: Distribute Keys
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </Panel>
          <Caption id="p1-keygen" className="mt-3" />
        </div>
      )}

      {/* ---------------- Section C ---------------- */}
      {activeIndex >= 2 && (
        <div>
          <SectionHead step="C" title="Teleportation & Distribution" state={stateFor(2)} />
          <Panel>
            {store.distribution.length ? (
              <DistributionField
                targets={store.distribution}
                done={store.distributionDone}
                fast={store.fastForward}
              />
            ) : (
              <div className="skeleton h-56 w-full" />
            )}
            <div className="mt-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!store.distributionDone || store.section !== "distribute"}
                onClick={store.toHealth}
              >
                Next: Check Channel Health
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </Panel>
          <Caption id="p1-distribute" className="mt-3" />
        </div>
      )}

      {/* ---------------- Section D ---------------- */}
      {activeIndex >= 3 && (
        <div>
          <SectionHead step="D" title="Channel Health Check" state={stateFor(3)} />
          <Panel>
            <div className="flex justify-center">
              <HealthGauge
                health={store.health}
                measuring={store.healthStage === "running"}
              />
            </div>

            {store.health?.passed && (
              <div className="mt-5 animate-pop">
                <Banner
                  tone="pass"
                  title="Channel verified — safe to proceed"
                  action={
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => store.goToPage(2)}
                    >
                      Next: Sign a Message
                      <Icon name="chevronRight" size={15} />
                    </button>
                  }
                >
                  {store.health.explanation}
                </Banner>
              </div>
            )}

            {store.health && !store.health.passed && (
              <div className="mt-5 animate-shake">
                <Banner
                  tone="fail"
                  title="Channel compromised or unreliable — cannot proceed safely"
                  action={
                    <button type="button" className="btn btn-danger btn-sm" onClick={store.restart}>
                      <Icon name="rotate" size={15} />
                      Restart Simulation
                    </button>
                  }
                >
                  The system correctly refuses to operate on an untrusted channel — this
                  stop is intentional.
                </Banner>
              </div>
            )}

            {store.healthStage === "running" && (
              <div className="mt-5 skeleton h-16 w-full" aria-label="Awaiting health result" />
            )}

            <details className="group mt-5 border-t border-outline pt-3">
              <summary className="micro cursor-pointer list-none select-none transition-colors hover:text-primary">
                <span className="group-open:hidden">+ how is this measured?</span>
                <span className="hidden group-open:inline">− how is this measured?</span>
              </summary>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-n-600 dark:text-n-700">
                {caption("p1-health-explainer", store.explainMode)}
              </p>
            </details>
          </Panel>
          <Caption id="p1-health" className="mt-3" />
        </div>
      )}
    </div>
  );
}
