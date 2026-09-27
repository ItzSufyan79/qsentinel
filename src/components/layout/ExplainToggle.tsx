import { useFlow } from "../../state/flowStore";

const OPTIONS = [
  { id: "simple", label: "Simple" },
  { id: "technical", label: "Technical" },
] as const;

export function ExplainToggle() {
  const mode = useFlow((s) => s.explainMode);
  const setMode = useFlow((s) => s.setExplainMode);

  return (
    <div
      className="flex items-center border border-outline"
      role="radiogroup"
      aria-label="Explanation detail"
    >
      <span className="micro border-r border-outline px-2.5 py-1.5">
        Explain
      </span>
      {OPTIONS.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(opt.id)}
            className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase transition-colors duration-200 ${
              active
                ? "bg-primary text-on-primary"
                : "text-n-500 hover:bg-n-100 hover:text-on-bg"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
