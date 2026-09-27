import { useFlow } from "../state/flowStore";
import { ATTACK_CATALOGUE } from "../api/catalogue";
import { Caption, Panel, SectionHead } from "../components/ui/atoms";
import { Icon } from "../components/ui/Icon";
import { EveWire } from "../components/viz/EveWire";

export function Page3Attack() {
  const store = useFlow();
  const hostile = store.attackId !== "none";
  const knowledge = store.attack?.eve;
  const launched = store.attackStage === "done";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 sm:px-6">
      <div>
        <SectionHead step="A" title="Scenario Picker" state="active" />
        <Panel>
          <fieldset>
            <legend className="sr-only">Attack scenario</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ATTACK_CATALOGUE.map((option, index) => {
                const selected = store.attackId === option.id;
                return (
                  <div key={option.id} className="flex flex-col gap-2">
                    <label
                      className={`relative flex cursor-pointer cursor-pointer flex-col gap-1.5 border p-3 transition-colors duration-150 ${
                        selected
                          ? "border-ink bg-[color-mix(in_oklab,var(--qs-ink)_6%,transparent)]"
                          : "border-outline-strong bg-surface hover:border-ink/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="attack"
                        className="sr-only"
                        checked={selected}
                        onChange={() => store.selectAttack(option.id)}
                      />
                      <span className="flex items-center gap-2.5">
                        {/* selection mark: a filled square, not a radio dot */}
                        <span
                          className={`grid size-3.5 shrink-0 place-items-center border transition-colors ${
                            selected ? "border-ink bg-ink" : "border-n-400"
                          }`}
                        >
                          {selected && <Icon name="check" size={10} className="text-bg" />}
                        </span>
                        <span className="num text-[10px] font-semibold tracking-[0.1em] text-n-500">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[12px] font-semibold tracking-[0.06em] text-on-bg uppercase">
                          {option.title}
                        </span>
                        {option.id === "none" && (
                          <span className="chip chip-pass ml-auto">default</span>
                        )}
                      </span>
                      <span className="mt-0.5 pl-6 text-[12.5px] leading-snug text-n-600 dark:text-n-700">
                        {option.blurb}
                      </span>
                    </label>

                    {option.hasSlider && selected && (
                      <div className="flex items-center gap-3 border border-outline-strong bg-surface-2 px-3 py-2">
                        <span className="micro">intensity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={store.intensity}
                          onChange={(e) => store.setIntensity(Number(e.target.value))}
                          className="h-1 flex-1 accent-[var(--qs-primary)]"
                          aria-label="Attack intensity"
                        />
                        <span className="num w-11 text-right text-[12px] font-semibold text-accent-ink">
                          {store.intensity}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn btn-primary"
              disabled={store.attackStage === "running"}
              onClick={() => void store.launchAttack()}
            >
              <Icon name="play" size={15} />
              {store.attackStage === "running" ? "Launching…" : "Launch Scenario"}
            </button>
            <span className="micro max-w-64 leading-relaxed">
              “No Attack” is a valid run — launch it to see the honest baseline.
            </span>
            {!hostile && launched && (
              <button
                type="button"
                className="btn btn-secondary sm:ml-auto"
                onClick={() => store.startVerify()}
              >
                Next: See Verifier Results
                <Icon name="chevronRight" size={16} />
              </button>
            )}
          </div>
        </Panel>
        <Caption id={hostile ? "p3-attack" : "p3-none"} className="mt-3" />
      </div>

      {hostile && store.attackStage !== "idle" && (
        <div className="animate-fade-up">
          <SectionHead step="B" title="Attack Visualization" state="active" />
          <Panel>
            {store.attackStage === "running" && !store.attack ? (
              <div className="skeleton h-48 w-full" />
            ) : (
              <div className="flex flex-col gap-5">
                <EveWire
                  attack={store.attack}
                  verifiers={store.distribution.map((v) => v.name)}
                />

                {knowledge && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <section
                      className="border border-l-[3px] border-outline-strong border-l-pass bg-[var(--qs-pass-tint)] p-4"
                    >
                      <h3 className="micro mb-3 flex items-center gap-2 text-pass">
                        <Icon name="eye" size={13} />
                        eve · has access
                      </h3>
                      <ul className="space-y-1.5">
                        {knowledge.has.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2 text-[13px] text-on-bg"
                          >
                            <span className="mt-[6px] size-1.5 shrink-0 bg-pass" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section
                      className="border border-l-[3px] border-outline-strong border-l-fail bg-[var(--qs-fail-tint)] p-4"
                    >
                      <h3 className="micro mb-3 flex items-center gap-2 text-fail">
                        <Icon name="lock" size={13} />
                        eve · does <em className="not-italic">not</em> have
                      </h3>
                      <ul className="space-y-1.5">
                        {knowledge.hasNot.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2 text-[13px] font-medium text-on-bg"
                          >
                            <span className="mt-[6px] size-1.5 shrink-0 bg-fail" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!launched}
                    onClick={() => store.startVerify()}
                  >
                    Next: See Verifier Results
                    <Icon name="chevronRight" size={16} />
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
