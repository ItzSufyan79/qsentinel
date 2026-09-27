import { useFlow, type FlowStore } from "../../state/flowStore";

const STEPS = [
  { label: "Setup", page: 1 as const, code: "01" },
  { label: "Sign", page: 2 as const, code: "02" },
  { label: "Attack", page: 3 as const, code: "03" },
  { label: "Verify", page: 4 as const, code: "04" },
  { label: "Report", page: 5 as const, code: "05" },
  { label: "Protocol", page: 6 as const, code: "06" },
];

type StepState = "done" | "active" | "pending";

/**
 * Reachability is separate from visual state: the Protocol step is clickable
 * as soon as a report exists, but still looks unvisited until you open it.
 */
function reachable(index: number, s: FlowStore): boolean {
  const step = STEPS[index];
  if (index === 4) return s.verifyStage === "done";
  if (index === 5) return !!s.report;
  return step.page <= s.maxPage;
}

function stepState(index: number, s: FlowStore): StepState {
  const active = s.page - 1;
  if (index === active) return "active";
  if (index < active) return "done";
  // The Report page is reachable once verification finished, which happens a
  // step before `maxPage` catches up.
  if (index === 4 && s.verifyStage === "done") return "done";
  if (s.maxPage > index + 1) return "done";
  return "pending";
}

export function TopStepper() {
  const store = useFlow();
  const goToPage = store.goToPage;

  return (
    <nav
      aria-label="Simulation progress"
      className="border-t border-outline"
      data-scroll-x
    >
      <ol className="mx-auto flex max-w-6xl items-stretch overflow-x-auto px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STEPS.map((step, i) => {
          const state = stepState(i, store);
          const canOpen = reachable(i, store);
          const nextState = stepState(i + 1, store);

          return (
            <li
              key={step.label}
              className="flex min-w-[7.5rem] flex-1 items-center sm:min-w-0"
            >
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => canOpen && goToPage(step.page)}
                aria-current={state === "active" ? "step" : undefined}
                className="group flex items-center gap-2 py-2.5 pr-3 text-left disabled:cursor-not-allowed"
              >
                {/* node: a small square, not a bubble */}
                <span
                  className={[
                    "block size-2.5 shrink-0 border transition-all duration-300",
                    state === "active" &&
                      "border-primary bg-primary outline-2 outline-offset-2 outline-[color-mix(in_oklab,var(--qs-primary)_35%,transparent)]",
                    state === "done" && "border-pass bg-pass",
                    state === "pending" && "border-outline-strong bg-transparent",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <span className="flex min-w-0 flex-col leading-none">
                  <span className="num text-[10px] tracking-[0.14em] text-n-500">
                    {step.code}
                  </span>
                  <span
                    className={[
                      "mt-1 font-mono text-[10.5px] font-semibold tracking-[0.13em] uppercase transition-colors",
                      state === "active" && "text-on-bg",
                      state === "done" &&
                        "text-n-600 group-hover:text-on-bg dark:text-n-700",
                      state === "pending" && "text-n-500",
                    ].join(" ")}
                  >
                    {step.label}
                  </span>
                </span>
              </button>

              {i < STEPS.length - 1 && (
                <span
                  className={`relative h-px min-w-4 flex-1 transition-colors duration-500 ${
                    nextState === "pending" ? "bg-outline" : "bg-pass"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
