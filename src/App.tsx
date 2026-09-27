/**
 * Global shell — design report, section 5.
 *
 * Top nav bar: wordmark (violet, Plex Sans 600) + nav links + a persistent
 * StatusBadge showing whether a simulation is running. No footer.
 * Responsive: nav collapses to a hamburger under 768px.
 */

import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useParams } from "react-router-dom";
import {
  IconAtom,
  IconChartBar,
  IconEye,
  IconHome,
  IconListDetails,
  IconMenu2,
  IconRocket,
  IconRoute,
  IconX,
} from "@tabler/icons-react";
import { api } from "./api";
import type { ActiveResponse } from "./api/types";
import { StatusBadge } from "./components/ui/atoms";

import { OverviewPage } from "./pages/Overview";
import { NewSimulationPage } from "./pages/NewSimulation";
import { LiveRunPage } from "./pages/LiveRun";
import { ResultsPage } from "./pages/Results";
import { ArbitrationPage } from "./pages/Arbitration";
import { DashboardPage } from "./pages/Dashboard";
import { EventLogPage } from "./pages/EventLog";

/* ------------------------------------------------------------------ */
/*  Theme — dark is the default                                        */
/* ------------------------------------------------------------------ */

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/* ------------------------------------------------------------------ */
/*  Wordmark                                                           */
/* ------------------------------------------------------------------ */

function Wordmark() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center rounded-[var(--qs-r-sm)] bg-primary font-condensed text-[15px] font-semibold text-on-primary">
        Q
        <span className="absolute -right-[3px] -bottom-[3px] size-[5px] rounded-[1px] bg-bg" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-condensed text-[15px] font-semibold tracking-[0.14em] text-primary uppercase">
          Qsentinel
        </span>
        <span className="micro mt-1 text-n-500">signature threat detection</span>
      </span>
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav links                                                          */
/* ------------------------------------------------------------------ */

const NAV = [
  { to: "/", label: "Overview", icon: IconHome, end: true },
  { to: "/simulate/new", label: "New Simulation", icon: IconRocket, end: false },
  { to: "/dashboard", label: "Dashboard", icon: IconChartBar, end: false },
  { to: "/log", label: "Event Log", icon: IconListDetails, end: false },
] as const;

/* ------------------------------------------------------------------ */
/*  Active-run badge — polls GET /api/simulate/active                   */
/* ------------------------------------------------------------------ */

function ActiveBadge() {
  const [active, setActive] = useState<ActiveResponse>({
    active: false,
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

  return (
    <StatusBadge tone={active.active ? "disputed" : "pending"}>
      {active.active ? `running · ${active.phase ?? ""}` : "idle"}
    </StatusBadge>
  );
}

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
      {theme === "dark" ? "light" : "dark"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end as boolean | undefined}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-[var(--qs-r)] px-3 py-2 font-condensed text-[13px] tracking-[0.04em] uppercase transition-colors ${
              isActive
                ? "bg-surface-2 font-semibold text-primary"
                : "text-n-600 hover:text-on-bg"
            }`
          }
        >
          <Icon size={15} />
          {label}
        </NavLink>
      ))}
    </>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  // dark by default, applied before first paint via the class on <html>
  useEffect(() => {
    applyTheme("dark");
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-outline bg-bg">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Wordmark />

          {/* desktop nav */}
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Primary">
            <NavItems />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ActiveBadge />
            <ThemeToggle />
            {/* hamburger under 768px */}
            <button
              type="button"
              className="btn btn-ghost btn-sm md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <IconX size={16} /> : <IconMenu2 size={16} />}
            </button>
          </div>
        </div>

        {/* mobile nav */}
        {menuOpen && (
          <nav
            className="border-t border-outline bg-bg px-4 py-3 md:hidden"
            aria-label="Primary mobile"
          >
            <div className="flex flex-col gap-1">
              <NavItems onNavigate={() => setMenuOpen(false)} />
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

export function useRunId(): string {
  const { runId } = useParams<{ runId: string }>();
  return runId ?? "";
}

export { IconAtom, IconEye, IconRoute };
