import { useFlow } from "../../state/flowStore";
import { Icon } from "../ui/Icon";
import { DemoControls, RestartControl } from "./Controls";

export function Footer() {
  const count = useFlow((s) => s.verifierCount);
  const profile = useFlow((s) => s.init?.hardwareProfile);
  const theme = useFlow((s) => s.theme);
  const toggleTheme = useFlow((s) => s.toggleTheme);

  return (
    <footer className="mt-16 border-t border-outline-strong bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-2">
            <dt className="micro">Verifiers</dt>
            <dd className="num text-[11px] font-semibold text-on-bg">
              {count ?? "—"}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="micro">Link</dt>
            <dd
              className="num max-w-[15rem] truncate text-[11px] text-n-600 dark:text-n-700"
              title="Hardware profile is fixed by design and cannot be changed"
            >
              {profile?.label ?? "loading…"}
            </dd>
          </div>
        </dl>

        <div className="ml-auto flex items-center gap-5">
          <DemoControls />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            className="grid size-6 place-items-center text-n-500 transition-colors hover:text-primary"
          >
            <Icon name={theme === "light" ? "moon" : "sun"} size={14} />
          </button>
          <RestartControl />
        </div>
      </div>
    </footer>
  );
}
