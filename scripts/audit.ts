/**
 * Headless visual audit.
 *
 * The agent cannot view images, so instead of guessing this drives headless
 * Chrome over the DevTools protocol and asks the page to measure what the eye
 * would check: horizontal overflow, unreadable type, low-contrast text and
 * clipped labels — at three viewport widths. It also writes PNGs to .audit/ so
 * a human can confirm.
 *
 * Run: npm run audit          (expects a server on AUDIT_URL, default :4173)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:4173";
const PORT = 9333;
const OUT_DIR = join(process.cwd(), ".audit");

/** Drive the flow by clicking through primary actions and fast-forwarding. */
const DEEP = process.argv.includes("--deep");
/** Dark is the shipped default, so it has to be measurable too. */
const THEME = process.argv.includes("--dark") ? "dark" : "light";
/**
 * Force the theme and stop every colour transition before measuring: a
 * mid-transition computed colour is a blend of the two palettes, which
 * produces convincing but meaningless contrast numbers.
 */
const SET_THEME = `(() => {
  let s = document.getElementById("qs-audit-freeze");
  if (!s) {
    s = document.createElement("style");
    s.id = "qs-audit-freeze";
    document.head.appendChild(s);
  }
  s.textContent = "*, *::before, *::after { transition: none !important; }";
  document.documentElement.classList.toggle("dark", ${JSON.stringify(THEME)} === "dark");
  return getComputedStyle(document.documentElement).getPropertyValue("--qs-bg").trim().toLowerCase();
})()`;
/** The app reads its theme from the class on <html>, so an assertable token. */
const BG_TOKEN = THEME === "dark" ? "#221d18" : "#f6efe7";
const CHECK_THEME = `getComputedStyle(document.documentElement).getPropertyValue("--qs-bg").trim().toLowerCase()`;

/** Reads the visible heading, which is how a step is identified. */
const CURRENT_PAGE = `(() => {
  const h1 = document.querySelector('h1');
  return h1 ? h1.textContent.trim() : '(no page)';
})()`;

const LOCATION = "location.pathname";

/** Picks an attack card by its label so a disputed run can be audited. */
const PICK_ATTACK = `(() => {
  const want = (${JSON.stringify("Collusion")}).toLowerCase();
  const btn = [...document.querySelectorAll('button[aria-pressed]')]
    .find((b) => (b.textContent || '').toLowerCase().includes(want));
  if (!btn) return 'no-option';
  btn.click();
  return 'picked';
})()`;

const SUBMIT = `(() => {
  const btn = [...document.querySelectorAll('button.btn-primary')]
    .find((b) => !b.disabled && b.offsetParent !== null && /start simulation/i.test(b.textContent || ''));
  if (!btn) return 'no-button';
  btn.click();
  return 'submitted';
})()`;

/** The static routes, all reachable without running a simulation. */
const STATIC_ROUTES: { path: string; label: string }[] = [
  { path: "/", label: "overview" },
  { path: "/simulate/new", label: "new-simulation" },
  { path: "/dashboard", label: "dashboard" },
  { path: "/log", label: "event-log" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "phone", width: 390, height: 844 },
];

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const res = { overflow: [], tinyText: [], lowContrast: [], clipped: [], tall: [] };

  const ch = (n) => (n >= '0' && n <= '9') || n === '.' || n === '-';
  const parse = (s) => {
    const m = (s || '').match(/-?[0-9.]+/g) || [];
    return m.slice(0, 4).map(Number);
  };
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p.length === 3 || (p.length >= 3 && p[3] > 0.5)) return p.slice(0, 3);
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  /** Tailwind's .sr-only and equivalents: present for screen readers, not eyes. */
  const screenReaderOnly = (el) => {
    const cs = getComputedStyle(el);
    return (
      (cs.position === 'absolute' && parseFloat(cs.width) <= 1.5) ||
      cs.clipPath === 'inset(50%)' ||
      (cs.clip !== 'auto' && cs.clip !== '')
    );
  };

  const scrollable = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  /** WCAG 1.4.3 exempts inactive components, so a dimmed button is not a defect. */
  const disabled = (el) => {
    for (let n = el; n; n = n.parentElement) {
      if (n.disabled === true) return true;
      if (n.getAttribute && n.getAttribute('aria-disabled') === 'true') return true;
    }
    return false;
  };

  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (Number(cs.opacity) === 0) continue;

    // horizontal overflow
    if ((r.right > vw + 1 || r.left < -1) && !scrollable(el)) {
      res.overflow.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 50),
        left: Math.round(r.left), right: Math.round(r.right),
      });
    }

    const text = (el.textContent || '').trim();
    if (!text || el.children.length !== 0) continue;

    const size = parseFloat(cs.fontSize);
    if (size < 12) {
      res.tinyText.push({ size: Math.round(size * 10) / 10, text: text.slice(0, 44) });
      continue;
    }

    if (disabled(el)) continue;

    const fg = parse(cs.color);
    if (fg.length >= 3) {
      const bg = bgOf(el);
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        res.lowContrast.push({
          ratio: Math.round(ratio * 100) / 100, min,
          size: Math.round(size * 10) / 10, text: text.slice(0, 44),
          fg: 'rgb(' + fg.slice(0, 3).join(',') + ')', bg: 'rgb(' + bg.join(',') + ')',
          opacity: Number(cs.opacity), disabled: disabled(el),
        });
      }
    }

    if (screenReaderOnly(el)) continue;

    if (el.scrollWidth > el.clientWidth + 2 && cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis') {
      res.clipped.push({ text: text.slice(0, 44), scroll: el.scrollWidth, client: el.clientWidth });
    }
  }

  res.tall = document.documentElement.scrollHeight;
  // Sanity: a blank or error page would "pass" every check above, so record
  // how much real content was actually there.
  res.elements = document.querySelectorAll('*').length;
  res.rootChildren = (document.getElementById('root') || {}).childElementCount || 0;
  res.title = document.title;
  return res;
})()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const json = (await res.json()) as { webSocketDebuggerUrl: string };
      return json.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome did not expose a debugging endpoint");
}

/** Minimal CDP client: one socket, sequential id-matched requests. */
class Cdp {
  private id = 0;
  private pending = new Map<number, (v: unknown) => void>();
  private ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg.result);
        this.pending.delete(msg.id);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const id = ++this.id;
    return new Promise<unknown>((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  /** Subscribe to an event; the payload is handed to the listener. */
  on(method: string, listener: (params: unknown) => void) {
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as { method?: string; params?: unknown };
      if (msg.method === method) listener(msg.params);
    });
  }

  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    return new Cdp(ws);
  }
}

interface ProbeResult {
  overflow: { tag: string; cls: string; left: number; right: number }[];
  tinyText: { size: number; text: string }[];
  lowContrast: {
    ratio: number; min: number; size: number; text: string;
    fg: string; bg: string; opacity: number; disabled: boolean;
  }[];
  clipped: { text: string; scroll: number; client: number }[];
  tall: number;
  elements: number;
  rootChildren: number;
  title: string;
}

async function evalString(
  browser: Cdp,
  sessionId: string,
  expression: string,
): Promise<string> {
  const out = (await browser.send(
    "Runtime.evaluate",
    { expression, returnByValue: true },
    sessionId,
  )) as { result: { value?: unknown } };
  return typeof out.result.value === "string" ? out.result.value : String(out.result.value);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const chrome: ChildProcess = spawn(
    CHROME,
    [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
      "--no-default-browser-check", "--disable-extensions",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(OUT_DIR, "profile")}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let problems = 0;
  try {
    const versionUrl = await waitForChrome();
    const browser = await Cdp.open(versionUrl);

    const { targetId } = (await browser.send("Target.createTarget", {
      url: "about:blank",
    })) as { targetId: string };
    const { sessionId } = (await browser.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);

    const consoleErrors: string[] = [];
    browser.on("Runtime.consoleAPICalled", (params) => {
      const args = (params as { args?: { value?: unknown }[] }).args ?? [];
      const text = args.map((a) => String(a.value)).join(" ");
      if (/error/i.test(text)) consoleErrors.push(text.slice(0, 160));
    });
    browser.on("Runtime.exceptionThrown", (params) => {
      const d = (params as { exceptionDetails?: { text?: string } }).exceptionDetails;
      if (d?.text) consoleErrors.push(d.text.slice(0, 160));
    });

    for (const vp of VIEWPORTS) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 500,
      }, sessionId);

      /* ---- create one real run, so the live/result/arbitration
              routes have a run id to be audited against ---- */
      let runId = "";
      await browser.send("Page.navigate", { url: `${URL_BASE}/simulate/new` }, sessionId);
      await sleep(2000);
      await browser.send("Runtime.evaluate", { expression: SET_THEME, returnByValue: true }, sessionId);
      await evalString(browser, sessionId, PICK_ATTACK);
      await sleep(500);
      // the collusion scenario needs at least two verifiers
      await browser.send("Runtime.evaluate", {
        expression: `(() => {
          const btn = document.querySelector('button[aria-label="2 verifiers"]');
          if (!btn) return 'no-stepper';
          btn.click();
          return 'verifiers=2';
        })()`,
        returnByValue: true,
      }, sessionId);
      await sleep(400);
      await evalString(browser, sessionId, SUBMIT);
      // the app navigates to the live run once the backend accepts it
      for (let i = 0; i < 30 && !runId; i++) {
        await sleep(300);
        const path = await evalString(browser, sessionId, LOCATION);
        const m = path.match(/\/simulate\/run\/([^/]+)/);
        if (m) runId = m[1]!;
      }
      if (!runId && DEEP) console.log(`   ! could not start a run at ${vp.name}`);

      const routes = [
        ...STATIC_ROUTES,
        ...(runId
          ? [
              { path: `/simulate/run/${runId}`, label: "live-run" },
              { path: `/simulate/run/${runId}/result`, label: "results" },
              { path: `/simulate/run/${runId}/arbitration`, label: "arbitration" },
            ]
          : []),
      ];

      for (const route of routes) {
        await browser.send("Page.navigate", { url: URL_BASE + route.path }, sessionId);
        // live runs animate through their phases; give them room to settle
        await sleep(route.label === "live-run" ? 3500 : 1400);
        await browser.send("Runtime.evaluate", { expression: SET_THEME, returnByValue: true }, sessionId);
        await sleep(120);

        /* The app owns the class on <html>, so a re-render can reinstate the
           theme after we set it. Measuring contrast against the wrong palette
           produces convincing nonsense — re-assert, then assert. */
        let themeOk = (await evalString(browser, sessionId, CHECK_THEME)) === BG_TOKEN;
        if (!themeOk) {
          await browser.send("Runtime.evaluate", { expression: SET_THEME, returnByValue: true }, sessionId);
          await sleep(200);
          themeOk = (await evalString(browser, sessionId, CHECK_THEME)) === BG_TOKEN;
        }
        if (!themeOk) {
          console.log(
            `\n✗ ${vp.name} ${route.path}: could not hold the ${THEME} theme, ` +
            `so its contrast numbers would be meaningless.`,
          );
          problems += 100;
          continue;
        }

        const evaluated = (await browser.send("Runtime.evaluate", {
          expression: PROBE, returnByValue: true,
        }, sessionId)) as { result: { value: ProbeResult } };
        const probe = evaluated.result.value;

        const shot = (await browser.send("Page.captureScreenshot", {
          format: "png",
        }, sessionId)) as { data: string };
        writeFileSync(join(OUT_DIR, `${vp.name}-${route.label}.png`), Buffer.from(shot.data, "base64"));

        if (probe.rootChildren === 0 || probe.elements < 40) {
          console.log(
            `\n✗ ${vp.name}${route.path}: the app did not render (${probe.elements} elements, ` +
            `root has ${probe.rootChildren} children). Results are meaningless.`,
          );
          problems += 100;
          continue;
        }

        const counts = {
          overflow: probe.overflow.length,
          tinyText: probe.tinyText.length,
          lowContrast: probe.lowContrast.length,
          clipped: probe.clipped.length,
        };
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        problems += total;

        const heading = await evalString(browser, sessionId, CURRENT_PAGE);
        console.log(
          `\n${vp.name} ${vp.width}×${vp.height}  ${route.path}  "${heading}" — ` +
          `${probe.elements} elements, height ${probe.tall}px, ` +
          `overflow ${counts.overflow}, tiny ${counts.tinyText}, ` +
          `low-contrast ${counts.lowContrast}, clipped ${counts.clipped}`,
        );
        for (const o of probe.overflow.slice(0, 4)) {
          console.log(`   overflow  <${o.tag} class="${o.cls}"> ${o.left}→${o.right}`);
        }
        for (const t of probe.tinyText.slice(0, 4)) {
          console.log(`   tiny      ${t.size}px  "${t.text}"`);
        }
        for (const c of probe.lowContrast.slice(0, 4)) {
          console.log(
            `   contrast  ${c.ratio}:1 (needs ${c.min}) ${c.size}px  "${c.text}"  ` +
            `${c.fg} on ${c.bg} opacity=${c.opacity}${c.disabled ? " disabled" : ""}`,
          );
        }
        for (const c of probe.clipped.slice(0, 4)) {
          console.log(`   clipped   "${c.text}" ${c.client}px box, ${c.scroll}px content`);
        }
      }
    }

    if (consoleErrors.length > 0) {
      const unique = [...new Set(consoleErrors)];
      console.log(`\n! ${unique.length} console error(s):`);
      for (const e of unique.slice(0, 10)) console.log(`   ${e}`);
      problems += unique.length;
    }

    console.log(`\nScreenshots in ${OUT_DIR}`);
    console.log(problems === 0 ? "No layout problems detected." : `${problems} item(s) to review.`);
    if (problems > 0) process.exitCode = 1;
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("audit failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
