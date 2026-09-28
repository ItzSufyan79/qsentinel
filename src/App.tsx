/**
 * Global shell — design report, section 5.
 *
 * Top nav bar: wordmark + nav links + a persistent StatusBadge reporting the
 * active-run state from GET /api/simulate/active. No footer.
 * Responsive: nav collapses to a hamburger under 768px.
 *
 * The dark class ships on <html> in index.html so the default theme is applied
 * before first paint; the toggle below only has to keep React in sync.
 */

import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import {
  IconChartBar,
  IconEye,
  IconHome,
  IconListDetails,
  IconMenu2,
  IconMoon,
  IconRocket,
  IconRoute,
  IconSun,
  IconX,
} from "@tabler/icons-react";
import { api } from "./api";
import type { ActiveResponse } from "./api/types";
import { StatusBadge, type BadgeTone } from "./components/ui/atoms";

import { OverviewPage } from "./pages/Overview";
import { NewSimulationPage } from "./pages/NewSimulation";
import { LiveRunPage } from "./pages/LiveRun";
import { ResultsPage } from "./pages/Results";
import { ArbitrationPage } from "./pages/Arbitration";
import { DashboardPage } from "./pages/Dashboard";
import { EventLogPage } from "./pages/EventLog";

/* ------------------------------------------------------------------ */
/*  Active run — polled once in the shell, shared by the badge and nav  */
/* ------------------------------------------------------------------ */

function useActiveRun() {
  const [active, setActive] = useState<ActiveResponse>({
    status: "none",
    runId: null,
    phase: null,
  });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.getActive();
        if (!cancelled) setActive(res);
      } catch {
        // a badge must never take the app down
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return active;
}

/* ------------------------------------------------------------------ */
/*  Theme — dark is the default, set on <html> before first paint        */
/* ------------------------------------------------------------------ */

/* The browser chrome colour per theme; the icon hrefs live in index.html. */
const THEME_COLOR = { light: "#F6EFE7", dark: "#221D18" } as const;

function applyTheme(theme: "light" | "dark") {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);

  // The tab icon and the browser chrome have to follow the page: index.html
  // only guesses from the OS setting, and the toggle can move off it.
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
    link.disabled = link.dataset.theme === "dark" ? !dark : dark;
  }
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

/* ------------------------------------------------------------------ */
/*  Header status — the four states the contract defines                */
/* ------------------------------------------------------------------ */

const RUN_STATUS: Record<
  ActiveResponse["status"],
  { tone: BadgeTone; label: string }
> = {
  none: { tone: "pending", label: "No active simulation" },
  running: { tone: "disputed", label: "Simulation running" },
  completed: { tone: "honest", label: "Simulation completed" },
  disputed: { tone: "attack", label: "Simulation disputed" },
};

/* ------------------------------------------------------------------ */
/*  Wordmark                                                           */
/* ------------------------------------------------------------------ */

function Wordmark() {
  return (
    <NavLink to="/" className="flex flex-none items-center gap-2.5">
      <span className="relative grid size-9 place-items-center rounded-[var(--qs-r)] bg-primary font-display text-[16px] font-semibold text-on-primary md:size-10 md:text-[17px]">
        Q
        <span className="absolute -right-[3px] -bottom-[3px] size-[5px] rounded-[1px] bg-bg" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-semibold tracking-[0.14em] text-accent-ink uppercase md:text-[16px]">
          Qsentinel
        </span>
        <span className="micro mt-1.5 hidden text-n-500 lg:block">
          signature threat detection
        </span>
      </span>
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav links                                                          */
/* ------------------------------------------------------------------ */

const STATIC_NAV = [
  { to: "/", label: "Overview", icon: IconHome, end: true },
  { to: "/simulate/new", label: "New Simulation", icon: IconRocket, end: false },
  { to: "/dashboard", label: "Dashboard", icon: IconChartBar, end: false },
  { to: "/log", label: "Event Log", icon: IconListDetails, end: false },
] as const;

/* ------------------------------------------------------------------ */
/*  Theme toggle                                                       */
/* ------------------------------------------------------------------ */

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */

function NavItems({
  runId,
  onNavigate,
}: {
  runId: string | null;
  onNavigate?: () => void;
}) {
  // Live Run and Results are run-specific, so they fall back to New
  // Simulation until a run exists — but they are always in the nav.
  const runNav = [
    {
      to: runId ? `/simulate/run/${runId}` : "/simulate/new",
      label: "Live Run",
      icon: IconRoute,
    },
    {
      to: runId ? `/simulate/run/${runId}/result` : "/simulate/new",
      label: "Results",
      icon: IconEye,
    },
  ];

  return (
    <>
      {STATIC_NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end as boolean | undefined}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex flex-none items-center gap-1.5 rounded-[var(--qs-r)] px-1.5 py-2 font-display text-[12px] tracking-[0.03em] uppercase transition-colors lg:gap-2.5 lg:px-4 lg:text-[13px] ${
              isActive
                ? "bg-surface-2 font-semibold text-accent-ink"
                : "text-n-600 hover:bg-surface-2/60 hover:text-on-bg"
            }`
          }
        >
          <Icon size={16} className="hidden lg:block" />
          {label}
        </NavLink>
      ))}
      {runNav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex flex-none items-center gap-1.5 rounded-[var(--qs-r)] px-1.5 py-2 font-display text-[12px] tracking-[0.03em] uppercase transition-colors lg:gap-2.5 lg:px-4 lg:text-[13px] ${
              isActive
                ? "bg-surface-2 font-semibold text-accent-ink"
                : "text-n-600 hover:bg-surface-2/60 hover:text-on-bg"
            }`
          }
        >
          <Icon size={16} className="hidden lg:block" />
          {label}
        </NavLink>
      ))}
    </>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeRun = useActiveRun();
  const runId = activeRun.runId;
  const status = RUN_STATUS[activeRun.status];

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-outline bg-bg">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-5 py-4 md:px-8 lg:gap-8 lg:px-10">
          <Wordmark />

          {/* desktop nav — centred in the space between wordmark and actions */}
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex"
            aria-label="Primary"
          >
            <NavItems runId={runId} />
          </nav>

          <div className="ml-auto flex flex-none items-center gap-3">
            <span className="hidden lg:inline-flex">
              <StatusBadge tone={status.tone}>
                {activeRun.status === "running" && activeRun.phase
                  ? `${status.label} · ${activeRun.phase}`
                  : status.label}
              </StatusBadge>
            </span>
            <ThemeToggle />
            {/* hamburger under 768px */}
            <button
              type="button"
              className="btn btn-ghost btn-sm md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="primary-mobile-nav"
            >
              {menuOpen ? <IconX size={16} /> : <IconMenu2 size={16} />}
            </button>
          </div>
        </div>

        {/* mobile nav */}
        {menuOpen && (
          <nav
            id="primary-mobile-nav"
            className="border-t border-outline bg-bg px-6 py-4 md:hidden"
            aria-label="Primary mobile"
          >
            <div className="grid grid-cols-2 gap-2">
              <NavItems runId={runId} onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="mt-4 border-t border-outline pt-4">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
          </nav>
        )}
      </header>

      <main className="canvas-grid flex-1">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/simulate/new" element={<NewSimulationPage />} />
          <Route path="/simulate/run/:runId" element={<LiveRunPage />} />
          <Route path="/simulate/run/:runId/result" element={<ResultsPage />} />
          <Route
            path="/simulate/run/:runId/arbitration"
            element={<ArbitrationPage />}
          />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/log" element={<EventLogPage />} />
          <Route path="*" element={<OverviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
