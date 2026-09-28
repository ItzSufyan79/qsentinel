/**
 * New Simulation (`/simulate/new`) — design report, section 4.2.
 *
 * Configure and launch a run. Answers "what exactly do we check for each
 * attack type" at setup time. Two-column: attack selection left, protocol
 * parameters right.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ATTACK_OPTIONS, type AttackTypeId } from "../api/types";
import { useApi } from "../lib/useApi";
import {
  Banner,
  ComparisonBar,
  DataCard,
  Panel,
  ParamSlider,
  SectionHead,
} from "../components/ui/atoms";
import { ErrorBanner } from "../components/ui/ErrorBanner";

const N_MIN = 50;
const N_MAX = 2000;
const T_MIN = 0.05;
const T_MAX = 0.35;

export function NewSimulationPage() {
  const navigate = useNavigate();
  const [attack, setAttack] = useState<AttackTypeId>("honest");
  const [n, setN] = useState(200);
  const [threshold, setThreshold] = useState(0.1);
  const [running, setRunning] = useState(false);

  const selected = useMemo(
    () => ATTACK_OPTIONS.find((a) => a.id === attack) ?? ATTACK_OPTIONS[0]!,
    [attack],
  );

  const { data: preview, loading: previewLoading, error } = useApi(
    () => api.preview(attack, n, threshold),
    [attack, n, threshold],
  );

  const launch = async () => {
    setRunning(true);
    try {
      const run = await api.createRun(attack, n, threshold, 1);
      navigate(`/simulate/run/${run.runId}`);
    } catch {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <p className="micro text-primary">Configure a run</p>
      <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold text-on-bg">
        New simulation
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-n-600">
        Nine attack scenarios. Pick one, set the protocol parameters, and the
        preview shows the expected detection confidence at that qubit count.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ------------------------- attack selection ------------------------- */}
        <div>
          <SectionHead step="A" title="Attack scenario">
            <span className="micro text-n-500">static lookup</span>
          </SectionHead>
          <fieldset>
            <legend className="sr-only">Attack scenario</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ATTACK_OPTIONS.map((opt) => {
                const active = opt.id === attack;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAttack(opt.id)}
                    aria-pressed={active}
                    className={`rounded-[var(--qs-r)] border p-3.5 text-left transition-colors ${
                      active
                        ? "border-primary bg-surface-2 ring-1 ring-primary"
                        : "border-outline bg-surface hover:border-outline-strong"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`grid size-4 place-items-center rounded-full border text-[11px] ${
                          active
                            ? "border-primary bg-primary text-on-primary"
                            : "border-outline-strong text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span
                        className={`display text-[13px] font-semibold tracking-[0.03em] uppercase ${
                          active ? "text-on-bg" : "text-n-600"
                        }`}
                      >
                        {opt.label}
                      </span>
                    </span>
                    {active && (
                      <span className="mt-2 block text-[13px] leading-snug text-n-600">
                        {opt.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-6">
            <Banner tone="brand" title="What this checks">
              <p>{selected.description}</p>
            </Banner>
          </div>
        </div>

        {/* ------------------------- parameters ------------------------- */}
        <div>
          <SectionHead step="B" title="Protocol parameters" />
          <Panel className="space-y-6 p-5">
            <ParamSlider
              label="N — qubit count"
              value={n}
              min={N_MIN}
              max={N_MAX}
              step={10}
              onChange={setN}
            />
            <ParamSlider
              label="Threshold T"
              value={threshold}
              min={T_MIN}
              max={T_MAX}
              step={0.01}
              onChange={setThreshold}
            />
            <div>
              <p className="display text-[13px] font-medium tracking-[0.04em] text-on-surface uppercase">
                Verifiers
              </p>
              <p className="num mt-1 text-[14px] text-n-600">
                1 <span className="text-n-500">(read-only — multi-verifier scaling planned for finale)</span>
              </p>
            </div>
          </Panel>

          <div className="mt-6">
            <SectionHead step="C" title="Detection preview">
              <span className="micro text-n-500">GET /api/simulate/preview</span>
            </SectionHead>
            <Panel className="p-5">
              {previewLoading && <div className="skeleton h-16 w-full" />}
              {preview && (
                <div className="space-y-4">
                  <DataCard
                    label="Predicted detection confidence"
                    value={preview.predictedDetectionConfidence}
                    unit=""
                    tone={preview.predictedDetectionConfidence > 0 ? "pass" : "neutral"}
                    hint={`at N=${preview.n}, T=${preview.threshold}`}
                  />
                  <ComparisonBar
                    label="Confidence vs. threshold"
                    left={preview.predictedDetectionConfidence}
                    right={0.8}
                    leftLabel="This configuration"
                    rightLabel="Typical detection floor"
                    format={(v) => v.toFixed(2)}
                  />
                </div>
              )}
            </Panel>
          </div>

          <button
            type="button"
            className="btn btn-primary mt-6 w-full"
            disabled={running}
            onClick={() => void launch()}
          >
            {running ? "Launching…" : "Run simulation"}
          </button>
        </div>
      </div>

      <ErrorBanner error={error} />
    </div>
  );
}
