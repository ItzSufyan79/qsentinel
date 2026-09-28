/**
 * Global shell. Top bar (wordmark + nav + glossary + theme toggle), main
 * routes for the five-page IA, and a persistent footer (report §4:
 * "PS 26141 · SIH 2026" and the honest "simulation, not hardware" line).
 * Old dashboard/log routes redirect to their new homes.
 */

import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { IconMoon, IconMenu2, IconSun, IconX } from "@tabler/icons-react";
import { HONEST } from "./lib/copy";
import { GLOSSARY } from "./lib/glossary";
import { getLastRun } from "./lib/runStore";
import { Icon, StatusBadge } from "./components/ui/atoms";

import { OverviewPage } from "./pages/Overview";
import { NewSimulationPage } from "./pages/NewSimulation";
import { LiveRunPage } from "./pages/LiveRun";
import { ResultsPage } from "./pages/Results";
import { HistoryPage } from "./pages/History";

/* ------------------------------------------------------------------ */
/*  Theme — dark default (set in index.html); the toggle keeps in sync   */
/* ------------------------------------------------------------------ */

const THEME_COLOR = { light: "#F6EFE7", dark: "#221D18" } as const;

function applyTheme(theme: "light" | "dark") {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
    link.disabled = link.dataset.theme === "dark" ? !dark : dark;
  }
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  useEffect(() => applyTheme(theme), [theme]);
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
/*  Glossary slide-over                                                */
/* ------------------------------------------------------------------ */

function GlossaryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div aria-hidden={!open} className={`drawer-root ${open ? "drawer-open" : ""}`}>
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Close glossary" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="glossary-title">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 id="glossary-title" className="display text-[14px] font-semibold tracking-[0.08em] uppercase">
            Glossary
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close glossary">
            <IconX size={16} />
          </button>
        </div>
        <dl className="drawer-body space-y-4 px-5 pb-8">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt className="display text-[13px] font-medium text-ink uppercase">{g.term}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-n-600">{g.definition}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-outline">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8 lg:px-10">
        <div>
          <p className="display text-[13px] font-medium tracking-[0.1em] text-ink uppercase">
            PS 26141 · SIH 2026
          </p>
          <p className="micro mt-1.5 text-n-500">
            Quantum Digital Signature threat detection · SIH 2026 submission
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]" aria-label="Footer">
          <a href="/#how-it-works" className="text-n-600 hover:text-ink">How it works</a>
          <a href="/#attacks" className="text-n-600 hover:text-ink">Attacks</a>
          <a href="/#limits" className="text-n-600 hover:text-ink">Limits</a>
          <NavLink to="/history" className="text-n-600 hover:text-ink">Run history</NavLink>
          <NavLink to="/simulate" className="text-n-600 hover:text-ink">New simulation</NavLink>
        </nav>
        <p className="max-w-xs text-[13px] leading-relaxed text-n-500">
          <StatusBadge tone="warn">{HONEST.simulation}</StatusBadge>
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
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
          QSentinel
        </span>
        <span className="micro mt-1.5 hidden text-n-500 lg:block">signature threat detection</span>
      </span>
    </NavLink>
  );
}

function LegacyRedirect({ to, param }: { to: (id: string) => string; param: string }) {
  const { [param]: id } = useParams<{ [k: string]: string }>();
  return <Navigate to={to(id ?? "")} replace />;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  // landing anchor scrolling (report §4 nav)
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location]);

  const lastRun = getLastRun();
  const runId = lastRun?.sessionId ?? null;

  const anchor = (id: string) => {
    if (location.pathname !== "/") {
      navigate(`/#${id}`);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const navLink = (to: string, label: string, end = false) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setMenuOpen(false)}
      className={({ isActive }) =>
        `flex flex-none items-center gap-1.5 rounded-[var(--qs-r)] px-1.5 py-2 font-display text-[12px] tracking-[0.03em] uppercase transition-colors lg:gap-2.5 lg:px-4 lg:text-[13px] ${
          isActive ? "bg-surface-2 font-semibold text-accent-ink" : "text-n-600 hover:bg-surface-2/60 hover:text-ink"
        }`
      }
    >
      {label}
    </NavLink>
  );

  const item = (label: string, on: () => void) => (
    <button
      key={label}
      type="button"
      onClick={on}
      className="flex flex-none items-center gap-1.5 rounded-[var(--qs-r)] px-1.5 py-2 font-display text-[12px] tracking-[0.03em] uppercase transition-colors text-n-600 hover:text-ink lg:gap-2.5 lg:px-4 lg:text-[13px]"
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-outline bg-bg">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-5 py-4 md:px-8 lg:gap-6 lg:px-10">
          <Wordmark />

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary">
            {item("How it works", () => anchor("how-it-works"))}
            {item("Attacks", () => anchor("attacks"))}
            {item("Limits", () => anchor("limits"))}
            {navLink("/history", "Run history")}
            {runId && navLink(`/run/${runId}`, "Live Run")}
            {runId && navLink(`/results/${runId}`, "Results")}
          </nav>

          <div className="ml-auto flex flex-none items-center gap-3">
            <Link to="/simulate" className="btn btn-primary btn-sm hidden md:inline-flex">
              Start detecting attacks
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setGlossaryOpen(true)}
              aria-label="Open glossary"
            >
              <Icon name="book" size={15} /> <span className="hidden sm:inline">Glossary</span>
            </button>
            <ThemeToggle />
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

        {menuOpen && (
          <nav
            id="primary-mobile-nav"
            className="grid grid-cols-2 gap-2 border-t border-outline bg-bg px-6 py-4 md:hidden"
            aria-label="Primary mobile"
          >
            {item("How it works", () => { setMenuOpen(false); anchor("how-it-works"); })}
            {item("Attacks", () => { setMenuOpen(false); anchor("attacks"); })}
            {item("Limits", () => { setMenuOpen(false); anchor("limits"); })}
            {navLink("/simulate", "New simulation")}
            {navLink("/history", "Run history")}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/simulate" element={<NewSimulationPage />} />
          <Route path="/run/:runId" element={<LiveRunPage />} />
          <Route path="/results/:runId" element={<ResultsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          {/* legacy redirects from the pre-report IA */}
          <Route path="/simulate/new" element={<Navigate to="/simulate" replace />} />
          <Route
            path="/simulate/run/:runId"
            element={<LegacyRedirect to={(id) => `/run/${id}`} param="runId" />}
          />
          <Route
            path="/simulate/run/:runId/result"
            element={<LegacyRedirect to={(id) => `/results/${id}`} param="runId" />}
          />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/log" element={<Navigate to="/" replace />} />
          <Route path="*" element={<OverviewPage />} />
        </Routes>
      </main>

      <Footer />
      <GlossaryDrawer open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
    </div>
  );
}