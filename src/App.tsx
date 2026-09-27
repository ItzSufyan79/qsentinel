import { useEffect } from "react";
import { useFlow } from "./state/flowStore";
import { ExplainToggle } from "./components/layout/ExplainToggle";
import { Footer } from "./components/layout/Footer";
import { RecapBanner } from "./components/layout/RecapBanner";
import { TopStepper } from "./components/layout/TopStepper";
import { ErrorPanel } from "./components/layout/ErrorPanel";
import { SkipButton } from "./components/layout/Controls";
import { Icon } from "./components/ui/Icon";
import { Page1KeyGen } from "./pages/Page1KeyGen";
import { Page2Sign } from "./pages/Page2Sign";
import { Page3Attack } from "./pages/Page3Attack";
import { Page4Verify } from "./pages/Page4Verify";
import { Page5Dashboard } from "./pages/Page5Dashboard";
import { Page6Protocol } from "./pages/Page6Protocol";

/** Square instrument mark: hairline frame, tick rule, no gradient, no radius. */
function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center border border-primary bg-primary text-[13px] font-black text-on-primary">
        Q
        <span className="absolute -right-[3px] -bottom-[3px] size-[5px] bg-surface outline outline-1 outline-primary" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-mono text-[12.5px] font-semibold tracking-[0.2em] text-on-bg uppercase">
          Qsentinel
        </span>
        <span className="micro mt-1">signature threat simulator</span>
      </span>
    </span>
  );
}

function Splash() {
  return (
    <div className="canvas-grid grid min-h-screen place-items-center bg-bg px-6">
      <div className="card w-full max-w-xs p-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="skeleton mx-auto mt-6 h-2 w-40" />
        <p className="micro mt-4 animate-pulse-soft text-center">initialising run</p>
      </div>
    </div>
  );
}

export default function App() {
  const booting = useFlow((s) => s.booting);
  const boot = useFlow((s) => s.boot);
  const page = useFlow((s) => s.page);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "s" && event.key !== "S" && event.key !== " ") return;
      const store = useFlow.getState();
      if (!store.running) return;
      event.preventDefault();
      store.skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (booting) return <Splash />;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-outline-strong bg-bg">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <Logo />
          <span className="chip chip-neutral hidden sm:inline-flex">
            <Icon name="shield" size={12} />
            <span className="num">SIH PS 26141</span>
          </span>
          <span className="micro ml-auto hidden md:inline">
            deterministic · seed locked
          </span>
          <ExplainToggle />
        </div>
        <TopStepper />
      </header>

      <div className="pt-3">
        <RecapBanner />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <ErrorPanel />
        </div>
      </div>

      <main className="canvas-grid flex-1 pt-10 pb-4">
        <div key={page} className="animate-fade-up">
          {page === 1 && <Page1KeyGen />}
          {page === 2 && <Page2Sign />}
          {page === 3 && <Page3Attack />}
          {page === 4 && <Page4Verify />}
          {page === 5 && <Page5Dashboard />}
          {page === 6 && <Page6Protocol />}
        </div>
      </main>

      <Footer />
      <SkipButton />
    </div>
  );
}
