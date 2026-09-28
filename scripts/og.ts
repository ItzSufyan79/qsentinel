/**
 * Regenerate public/og.png — the social preview card.
 *
 * The card is composed as an HTML string using the app's own palette and
 * self-hosted IBM Plex faces, then rendered by headless Chrome over the
 * DevTools protocol, because the agent cannot draw an image directly.
 * It is committed as a PNG so the site has no runtime dependency on a
 * renderer.
 *
 * Run: npm run og
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const WIDTH = 1200;
const HEIGHT = 630;
const OUT = join(process.cwd(), "public", "og.png");
/* The card is written to disk rather than a data: URL, because a data: document
   has an opaque origin and Chrome then refuses the file:// font requests. */
const OUT_DIR = join(process.cwd(), ".audit");
const HTML = join(OUT_DIR, "og.html");

/* IBM Plex woff2 files, served from node_modules so the card renders in the
   shipped typeface rather than a system fallback. */
const FONT_DIR = join(process.cwd(), "node_modules", "@fontsource");
const font = (family: string, weight: number, condensed = false) => {
  const dir = join(
    FONT_DIR,
    condensed ? "ibm-plex-sans-condensed" : family === "mono" ? "ibm-plex-mono" : "ibm-plex-sans",
  );
  return `@font-face{font-family:"${family === "mono" ? "Plex Mono" : condensed ? "Plex Cond" : "Plex Sans"}";font-weight:${weight};src:url("file://${join(dir, `files/ibm-plex-${condensed ? "sans-condensed" : family === "mono" ? "mono" : "sans"}-latin-${weight}-normal.woff2`)}") format("woff2");font-display:block;}`;
};

const CARD = `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600].map((w) => font("sans", w)).join("\n")}
${[400, 500, 600].map((w) => font("sans", w, true)).join("\n")}
${[400, 500, 600].map((w) => font("mono", w)).join("\n")}
*{box-sizing:border-box;margin:0}
body{width:${WIDTH}px;height:${HEIGHT}px;background:#f6efe7;color:#3e362f;
 font-family:"Plex Sans",sans-serif;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;
 background-image:linear-gradient(#e4daca 1px,transparent 1px),linear-gradient(90deg,#e4daca 1px,transparent 1px);
 background-size:60px 60px;opacity:.55}
.wrap{position:relative;padding:64px 72px;display:flex;flex-direction:column;height:100%}
.mark{display:flex;align-items:center;gap:18px}
.tile{width:76px;height:76px;display:grid;place-items:center;background:#ba7f5d;color:#2a241e;
 font-family:"Plex Cond",sans-serif;font-size:46px;font-weight:600;border-radius:4px;position:relative}
.tile i{position:absolute;right:-5px;bottom:-5px;width:9px;height:9px;background:#f6efe7;border-radius:2px}
.name{font-family:"Plex Cond",sans-serif;font-size:40px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#805539}
.tag{font-family:"Plex Mono",monospace;font-size:17px;font-weight:500;letter-spacing:.09em;
 text-transform:uppercase;color:#6e6355;margin-top:8px}
h1{font-family:"Plex Cond",sans-serif;font-size:76px;font-weight:600;line-height:1.02;
 letter-spacing:-.005em;margin-top:52px;max-width:1010px}
h1 em{font-style:normal;color:#805539}
.sub{font-size:26px;line-height:1.4;color:#5a5145;margin-top:22px;max-width:940px}
.foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{font-family:"Plex Mono",monospace;font-size:16px;font-weight:500;letter-spacing:.08em;
 text-transform:uppercase;padding:9px 14px;border:1px solid #c9bca6;border-radius:3px;color:#5a5145}
.chip.pass{border-color:#8a9a7e;color:#5f6b52}
.chip.fail{border-color:#a8493a;color:#a8493a}
.ps{font-family:"Plex Mono",monospace;font-size:15px;letter-spacing:.1em;text-transform:uppercase;
 color:#6e6355;text-align:right;line-height:1.7;white-space:nowrap}
.rule{position:absolute;left:0;right:0;bottom:0;height:10px;
 background:linear-gradient(90deg,#ba7f5d 0 34%,#8a9a7e 34% 67%,#a8493a 67% 100%)}
</style></head><body>
<div class="grid"></div>
<div class="wrap">
  <div class="mark">
    <span class="tile">Q<i></i></span>
    <span>
      <span class="name">Qsentinel</span>
      <span class="tag">signature threat detection</span>
    </span>
  </div>
  <h1>Quantum-inspired detection for<br><em>digital signatures</em></h1>
  <p class="sub">Nine attack scenarios, statistical thresholds, and the evidence trail behind every verdict — no AI, no black box.</p>
  <div class="foot">
    <div class="chips">
      <span class="chip pass">QDS simulation</span>
      <span class="chip">9 attack scenarios</span>
      <span class="chip fail">verifiable detection</span>
    </div>
    <div class="ps">SIH PS 26141<br>Egreen Quanta</div>
  </div>
</div>
<div class="rule"></div>
</body></html>`;

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(HTML, CARD);

  const chrome: ChildProcess = spawn(
    CHROME,
    [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
      "--no-default-browser-check", "--disable-extensions",
      "--allow-file-access-from-files",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(OUT_DIR, "og-profile")}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const browser = await Cdp.open(await waitForChrome());
    const { targetId } = (await browser.send("Target.createTarget", { url: "about:blank" })) as {
      targetId: string;
    };
    const { sessionId } = (await browser.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as { sessionId: string };

    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
    }, sessionId);

    await browser.send("Page.navigate", { url: `file://${HTML}` }, sessionId);
    // wait for the webfonts to settle before the shot
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      const out = (await browser.send(
        "Runtime.evaluate",
        { expression: "document.fonts.status", returnByValue: true },
        sessionId,
      )) as { result: { value?: string } };
      if (out.result.value === "loaded") break;
    }
    await sleep(300);

    /* Guard: a card that silently lost its fonts or overflowed its frame is
       worse than a failure, because it gets committed. */
    const check = (await browser.send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const faces = ["600 76px \\"Plex Cond\\"", "500 17px \\"Plex Mono\\"", "400 26px \\"Plex Sans\\""];
          const loaded = faces.map((f) => document.fonts.check(f));
          const over = [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > ${WIDTH} + 1)
            .map((el) => el.tagName + "." + el.className);
          return JSON.stringify({ loaded, over, w: document.body.scrollWidth, h: document.body.scrollHeight });
        })()`,
        returnByValue: true,
      },
      sessionId,
    )) as { result: { value?: string } };
    const report = JSON.parse(String(check.result.value)) as {
      loaded: boolean[]; over: string[]; w: number; h: number;
    };
    if (!report.loaded.every(Boolean) || report.over.length > 0) {
      throw new Error(`card is broken — fonts ${JSON.stringify(report.loaded)}, overflow ${JSON.stringify(report.over)}`);
    }

    const shot = (await browser.send("Page.captureScreenshot", { format: "png" }, sessionId)) as {
      data: string;
    };
    writeFileSync(OUT, Buffer.from(shot.data, "base64"));
    console.log(`Wrote ${OUT} (${WIDTH}×${HEIGHT}) — fonts loaded, nothing overflows`);
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("og render failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
