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

/** Which page the app is on, read from the stepper's aria-current. */
const CURRENT_PAGE = `(() => {
  const cur = document.querySelector('[aria-current="step"]');
  if (cur) return (cur.textContent || '').split(' ').filter(Boolean).join(' ');
  const h1 = document.querySelector('h1');
  return h1 ? h1.textContent.trim() : '(no page)';
})()`;

const CLICK_NEXT = `(() => {
  const btn = [...document.querySelectorAll('button.btn-primary')].find(
    (b) => !b.disabled && b.offsetParent !== null,
  );
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()`;

const SKIP = `(() => {
  const ev = new KeyboardEvent('keydown', { key: 's', bubbles: true });
  window.dispatchEvent(ev);
  return 'skip';
})()`;

/** The flow is gated on a verifier count, so pick one before driving. */
const CHOOSE_VERIFIERS = `(() => {
  const opt = [...document.querySelectorAll('button[aria-pressed]')]
    .find((b) => !b.disabled && b.offsetParent !== null);
  if (!opt) return 'no-option';
  opt.click();
  return 'chose ' + opt.textContent.trim();
})()`;

/** Page 2 is gated on a message, so type one when the field appears. */
const TYPE_MESSAGE = `(() => {
  const el = document.querySelector('input[type="text"], textarea');
  if (!el) return 'no-field';
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  ).set;
  setter.call(el, 'Transfer 42000 USD to escrow');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`;

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
    if (size < 9) {
      res.tinyText.push({ size: Math.round(size * 10) / 10, text: text.slice(0, 44) });
      continue;
    }

    const fg = parse(cs.color);
    if (fg.length >= 3) {
      const l1 = lum(fg), l2 = lum(bgOf(el));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        res.lowContrast.push({
          ratio: Math.round(ratio * 100) / 100, min,
          size: Math.round(size * 10) / 10, text: text.slice(0, 44),
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
  lowContrast: { ratio: number; min: number; size: number; text: string }[];
  clipped: { text: string; scroll: number; client: number }[];
  tall: number;
  elements: number;
  rootChildren: number;
  title: string;
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

    for (const vp of VIEWPORTS) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 500,
      }, sessionId);

      await browser.send("Page.navigate", { url: URL_BASE }, sessionId);
      await sleep(2200); // let the boot promise resolve and the first page paint

      if (DEEP) {
        const seen = new Map<string, string>();
        await browser.send("Runtime.evaluate", {
          expression: CHOOSE_VERIFIERS, returnByValue: true,
        }, sessionId);
        await sleep(400);
        for (let i = 0; i < 40; i++) {
          const page = (await browser.send("Runtime.evaluate", {
            expression: CURRENT_PAGE, returnByValue: true,
          }, sessionId)) as { result: { value: string } };
          const label = page.result.value;

          if (!seen.has(label)) {
            const shot = (await browser.send("Page.captureScreenshot", {
              format: "png",
            }, sessionId)) as { data: string };
            const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 28) || `step${i}`;
            writeFileSync(join(OUT_DIR, `${vp.name}-${slug}.png`), Buffer.from(shot.data, "base64"));
            seen.set(label, slug);
            console.log(`   captured "${label}"`);
          }

          await browser.send("Runtime.evaluate", { expression: TYPE_MESSAGE, returnByValue: true }, sessionId);
          await sleep(150);
          await browser.send("Runtime.evaluate", { expression: CLICK_NEXT, returnByValue: true }, sessionId);
          await sleep(500);
          await browser.send("Runtime.evaluate", { expression: SKIP, returnByValue: true }, sessionId);
          await sleep(700);
        }
        console.log(`   drove ${seen.size} distinct page(s)`);
      }

      const evaluated = (await browser.send("Runtime.evaluate", {
        expression: PROBE, returnByValue: true,
      }, sessionId)) as { result: { value: ProbeResult } };
      const probe = evaluated.result.value;

      const shot = (await browser.send("Page.captureScreenshot", {
        format: "png",
      }, sessionId)) as { data: string };
      writeFileSync(join(OUT_DIR, `${vp.name}.png`), Buffer.from(shot.data, "base64"));

      if (probe.rootChildren === 0 || probe.elements < 40) {
        console.log(
          `\n✗ ${vp.name}: the app did not render (${probe.elements} elements, ` +
          `root has ${probe.rootChildren} children, title "${probe.title}"). ` +
          `Is the server up at ${URL_BASE}? Results below are meaningless.`,
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

      console.log(
        `\n${vp.name} ${vp.width}×${vp.height} — ${probe.elements} elements, ` +
        `page height ${probe.tall}px, ` +
        `overflow ${counts.overflow}, tiny ${counts.tinyText}, ` +
        `low-contrast ${counts.lowContrast}, clipped ${counts.clipped}`,
      );
      for (const o of probe.overflow.slice(0, 5)) {
        console.log(`   overflow  <${o.tag} class="${o.cls}"> ${o.left}→${o.right}`);
      }
      for (const t of probe.tinyText.slice(0, 5)) {
        console.log(`   tiny      ${t.size}px  "${t.text}"`);
      }
      for (const c of probe.lowContrast.slice(0, 5)) {
        console.log(`   contrast  ${c.ratio}:1 (needs ${c.min}) ${c.size}px  "${c.text}"`);
      }
      for (const c of probe.clipped.slice(0, 5)) {
        console.log(`   clipped   "${c.text}" ${c.client}px box, ${c.scroll}px content`);
      }
    }

    console.log(`\nScreenshots in ${OUT_DIR}`);
    console.log(problems === 0 ? "No layout problems detected." : `${problems} item(s) to review.`);
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("audit failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
