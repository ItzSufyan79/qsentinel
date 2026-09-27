import { create } from "zustand";
import { api } from "../api";
import type { PlannedBlock } from "../api/contract";
import {
  describeError,
  isCancellation,
  type FailureStage,
  type RunError,
} from "../api/errors";
import type {
  Agreement,
  AttackId,
  AttackResponse,
  BellStateResponse,
  BlockResult,
  ChannelHealthResponse,
  DashboardReport,
  ExplainMode,
  InitResponse,
  KeygenResponse,
  LogEntry,
  MeasurementSeries,
  PageId,
  SignResponse,
  TeleportTrace,
  VerifierResult,
  VerifierTarget,
  VerifyEvent,
} from "../api/types";

export type Section = "setup" | "keygen" | "distribute" | "health" | "done";
export type Stage = "idle" | "running" | "done";

/** Live speed getter shared with the API layer (fast-forward shortens waits). */
let fastForward = false;
let controller: AbortController | null = null;
let bootStarted = false;

const speed = () => (fastForward ? 0.06 : 1);

function setFastForward(on: boolean) {
  fastForward = on;
  document.documentElement.style.setProperty(
    "--motion-scale",
    on ? "0.08" : "1",
  );
}

/** `?seed=…` in the URL makes any run reproducible from a shared link. */
function seedFromUrl(): number | undefined {
  const search = window.location?.search;
  if (!search) return undefined;
  const parsed = Number(new URLSearchParams(search).get("seed"));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function writeSeedToUrl(seed: number) {
  const href = window.location?.href;
  if (!href || !window.history) return;
  const url = new URL(href);
  url.searchParams.set("seed", String(seed));
  window.history.replaceState(null, "", url);
}

function newOp(): AbortSignal {
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

function abortOp() {
  controller?.abort();
  controller = null;
}

interface FlowState {
  /* global chrome */
  booting: boolean;
  init: InitResponse | null;
  explainMode: ExplainMode;
  theme: "light" | "dark";
  running: boolean;
  fastForward: boolean;
  forceChannelFail: boolean;
  error: RunError | null;

  /* navigation */
  page: PageId;
  maxPage: PageId;

  /* page 1 */
  section: Section;
  verifierCount: number | null;
  keygenMeta: KeygenResponse | null;
  keygen: { created: number; total: number; done: boolean } | null;
  distribution: VerifierTarget[];
  distributionDone: boolean;
  health: ChannelHealthResponse | null;
  healthStage: Stage;

  /* page 2 */
  message: string;
  signStage: Stage;
  signature: SignResponse | null;

  /* page 3 */
  attackId: AttackId;
  intensity: number;
  attackStage: Stage;
  attack: AttackResponse | null;

  /* page 4 */
  verifyStage: Stage;
  verifierResults: VerifierResult[];
  blockResults: Record<string, (BlockResult | null)[]>;
  agreement: Agreement | null;

  /* page 5 */
  report: DashboardReport | null;
  logs: LogEntry[];

  /* page 6 */
  protocol: {
    bell: BellStateResponse | null;
    teleport: TeleportTrace | null;
    measurements: MeasurementSeries[];
    /** which of the three optional endpoints this backend actually provides */
    provided: { bell: boolean; teleport: boolean; measurements: boolean };
  };
  protocolStage: Stage;
}

interface FlowActions {
  boot: () => Promise<void>;
  setExplainMode: (mode: ExplainMode) => void;
  toggleTheme: () => void;
  setVerifierCount: (count: number) => void;
  setForceChannelFail: (on: boolean) => void;

  startSimulation: () => Promise<void>;
  toDistribute: () => Promise<void>;
  toHealth: () => Promise<void>;
  goToPage: (page: PageId) => void;
  signMessage: () => Promise<void>;
  setMessage: (message: string) => void;
  selectAttack: (id: AttackId) => void;
  setIntensity: (value: number) => void;
  launchAttack: () => Promise<void>;
  startVerify: () => Promise<void>;
  skip: () => void;
  restart: () => void;
  replay: () => Promise<void>;
  clearError: () => void;
  retry: () => Promise<void>;
  loadProtocol: () => Promise<void>;
}

export type FlowStore = FlowState & FlowActions;

const initial: FlowState = {
  booting: true,
  init: null,
  explainMode: "simple",
  theme: "light",
  running: false,
  fastForward: false,
  forceChannelFail: false,
  error: null,

  page: 1,
  maxPage: 1,

  section: "setup",
  verifierCount: null,
  keygenMeta: null,
  keygen: null,
  distribution: [],
  distributionDone: false,
  health: null,
  healthStage: "idle",

  message: "",
  signStage: "idle",
  signature: null,

  attackId: "none",
  intensity: 50,
  attackStage: "idle",
  attack: null,

  verifyStage: "idle",
  verifierResults: [],
  blockResults: {},
  agreement: null,

  report: null,
  logs: [],

  protocol: {
    bell: null,
    teleport: null,
    measurements: [],
    provided: { bell: false, teleport: false, measurements: false },
  },
  protocolStage: "idle",
};

export const useFlow = create<FlowStore>((set, get) => {
  /**
   * A real failure: stop the spinners and record it. Callers check
   * `isCancellation` first so a Skip never lands here.
   */
  function fail(err: unknown, stage: FailureStage) {
    if (isCancellation(err)) return;
    setFastForward(false);
    set({ running: false, error: describeError(err, stage) });
  }

  return {
    ...initial,

    clearError: () => set({ error: null }),

    /** Re-runs the stage that failed. Inputs are preserved, so this is a resume. */
    async retry() {
      const failure = get().error;
      if (!failure || get().running) return;
      set({ error: null });

      switch (failure.stage) {
        case "boot":
          bootStarted = false;
          await get().boot();
          return;
        case "keygen":
          return get().startSimulation();
        case "distribute":
          return get().toDistribute();
        case "health":
          return get().toHealth();
        case "sign":
          return get().signMessage();
        case "attack":
          return get().launchAttack();
        case "verify":
          return get().startVerify();
        case "evidence":
          set({ error: failure });
          return;
      }
    },

    async boot() {
      if (bootStarted || get().init) return;
      bootStarted = true;
      try {
        const init = await api.init(seedFromUrl(), { signal: newOp(), speed });
        writeSeedToUrl(init.seed);
        set({ init, booting: false, error: null });
      } catch (err) {
        if (isCancellation(err)) return;
        bootStarted = false;
        set({
          booting: false,
          running: false,
          error: describeError(err, "boot"),
        });
      }
    },

    setExplainMode: (explainMode) => set({ explainMode }),

    toggleTheme: () => {
      const theme = get().theme === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", theme === "dark");
      set({ theme });
    },

    setVerifierCount: (verifierCount) => set({ verifierCount }),

    setForceChannelFail: (forceChannelFail) => set({ forceChannelFail }),

    async startSimulation() {
      const count = get().verifierCount;
      if (!count) return;

      const signal = newOp();
      setFastForward(false);
      const runId = get().init?.runId ?? "";
      const meta = await api.keygen(runId, { signal, speed });
      const targets = await api.distribute(runId, count, { signal, speed });

      set({
        error: null,
        running: true,
        section: "keygen",
        keygenMeta: meta,
        keygen: { created: 0, total: meta.totalSlots, done: false },
        distribution: targets.verifiers,
        distributionDone: false,
        health: null,
        healthStage: "idle",
      });

      try {
        await api.streamKeygen(
          runId,
          (created, total, done) => {
            if (signal.aborted) return;
            set({ keygen: { created, total, done } });
          },
          { signal, speed },
        );
      } catch (err) {
        if (!isCancellation(err)) fail(err, "keygen");
      } finally {
        setFastForward(false);
        if (!signal.aborted) set({ running: false });
      }
    },

    async toDistribute() {
      const targets = get().distribution;
      if (targets.length === 0) return;

      const signal = newOp();
      setFastForward(false);
      set({
        section: "distribute",
        running: true,
        distributionDone: false,
        error: null,
      });

      try {
        await api.streamDistribution(
          get().init?.runId ?? "",
          targets.map((t) => t.name),
          (verifiers) => {
            if (signal.aborted) return;
            set({ distribution: verifiers });
          },
          { signal, speed },
        );
        if (signal.aborted) return;
        set({ distributionDone: true });
      } catch (err) {
        if (!isCancellation(err)) fail(err, "distribute");
      } finally {
        setFastForward(false);
        if (!signal.aborted) set({ running: false });
      }
    },

    async toHealth() {
      const signal = newOp();
      setFastForward(false);
      set({
        section: "health",
        health: null,
        healthStage: "running",
        running: true,
        error: null,
      });

      try {
        const result = await api.channelHealth(get().init?.runId ?? "", {
          signal,
          speed,
          forceFail: get().forceChannelFail,
        });
        if (signal.aborted) return;
        set({
          health: result,
          healthStage: "done",
          running: false,
          section: result.passed ? "done" : "health",
          ...(result.passed ? { maxPage: 2 as PageId } : {}),
        });
      } catch (err) {
        if (!isCancellation(err)) fail(err, "health");
      } finally {
        setFastForward(false);
        if (!signal.aborted && get().healthStage === "running")
          set({ running: false });
      }
    },

    goToPage(page) {
      if (page === 5) {
        if (get().verifyStage !== "done") return;
      } else if (page > get().maxPage) {
        return;
      }
      set({ page });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    setMessage: (message) => set({ message }),

    async signMessage() {
      const message = get().message.trim();
      if (!message) return;

      const signal = newOp();
      setFastForward(false);
      set({ signStage: "running", running: true, error: null });

      try {
        const sentTo = get().distribution.map((v) => v.name);
        const signature = await api.sign(
          get().init?.runId ?? "",
          message,
          sentTo,
          { signal, speed },
        );
        if (signal.aborted) return;
        set({ signature, signStage: "done", running: false, maxPage: 3 });
      } catch (err) {
        if (!isCancellation(err)) fail(err, "sign");
      } finally {
        setFastForward(false);
        if (!signal.aborted && get().signStage === "running")
          set({ running: false });
      }
    },

    selectAttack: (attackId) => {
      if (get().attackStage === "running") return;
      set({ attackId, attack: null, attackStage: "idle" });
    },

    setIntensity: (intensity) => set({ intensity }),

    async launchAttack() {
      const { attackId, intensity } = get();
      const signal = newOp();
      setFastForward(false);
      set({ attackStage: "running", attack: null, running: true, error: null });

      try {
        const attack = await api.launchAttack(
          get().init?.runId ?? "",
          attackId,
          intensity,
          { signal, speed },
        );
        if (signal.aborted) return;
        set({ attack, attackStage: "done", running: false, maxPage: 4 });
      } catch (err) {
        if (!isCancellation(err)) fail(err, "attack");
      } finally {
        setFastForward(false);
        if (!signal.aborted && get().attackStage === "running")
          set({ running: false });
      }
    },

    async startVerify() {
      const state = get();
      if (state.verifyStage === "running") return;
      const names = state.distribution.map((v) => v.name);
      const init = state.init;
      if (names.length === 0 || !init) return;

      const signal = newOp();
      setFastForward(false);

      const runId = init.runId;
      let plan: PlannedBlock[];
      let results: VerifierResult[];
      try {
        ({ plan, results } = await api.planVerification(
          runId,
          names,
          state.attackId,
          state.intensity,
          init.seed,
          { signal, speed },
        ));
      } catch (err) {
        if (isCancellation(err)) return;
        fail(err, "verify");
        return;
      }

      const emptyGrid: Record<string, (BlockResult | null)[]> = {};
      names.forEach((name) => {
        emptyGrid[name] = Array.from(
          { length: results[0]?.total ?? 0 },
          () => null,
        );
      });

      set({
        page: 4,
        maxPage: 4,
        error: null,
        verifyStage: "running",
        running: true,
        verifierResults: results.map((r) => ({ ...r })),
        blockResults: emptyGrid,
        agreement: null,
        report: null,
        logs: [],
      });
      window.scrollTo({ top: 0, behavior: "smooth" });

      try {
        /* Buffer streamed events and flush on a timer — the backend emits ~400
         events per run and rendering each one individually janks the grid. */
        const buffer: VerifyEvent[] = [];
        let flushTimer: number | undefined;

        const flush = () => {
          flushTimer = undefined;
          if (buffer.length === 0) return;
          const batch = buffer.splice(0, buffer.length);
          set((current) => {
            const blockResults = { ...current.blockResults };
            const verifierResults = [...current.verifierResults];
            for (const event of batch) {
              const row = blockResults[event.verifier] ?? [];
              const nextRow = [...row];
              nextRow[event.block.index] = event.block;
              blockResults[event.verifier] = nextRow;
              const index = verifierResults.findIndex(
                (r) => r.name === event.verifier,
              );
              if (index >= 0) verifierResults[index] = event.result;
            }
            return { blockResults, verifierResults };
          });
        };

        await api.streamVerification(
          runId,
          plan,
          results,
          (event) => {
            if (signal.aborted) return;
            buffer.push(event);
            if (flushTimer === undefined) {
              flushTimer = window.setTimeout(flush, 32);
            }
          },
          { signal, speed },
        );

        if (flushTimer !== undefined) window.clearTimeout(flushTimer);
        flush();
        if (signal.aborted) return;

        const finalResults = results.map((r) => ({ ...r }));
        const [report, logs, agreement] = await Promise.all([
          api.buildReport(
            runId,
            names,
            finalResults,
            state.attack!,
            state.health?.score ?? 0,
            init.seed,
            { signal, speed },
          ),
          api.buildLogs(
            runId,
            state.attack!,
            finalResults,
            state.health?.score ?? 0,
            Date.now() - 9000,
          ),
          api.agreementFor(runId, finalResults),
        ]);

        set({
          verifierResults: finalResults,
          agreement,
          verifyStage: "done",
          running: false,
          maxPage: 5,
          report,
          logs,
        });
      } catch (err) {
        if (!isCancellation(err)) fail(err, "verify");
      } finally {
        setFastForward(false);
        if (!signal.aborted && get().verifyStage === "running")
          set({ running: false });
      }
    },

    /**
     * The Protocol page's data. All three calls are optional on the contract, so
     * a backend that has not built them reports what it does provide rather than
     * failing the page.
     */
    async loadProtocol() {
      if (get().protocolStage === "running") return;

      const signal = newOp();
      set({ protocolStage: "running", error: null });
      const runId = get().init?.runId ?? "";
      const ctx = { signal, speed };

      const optional = async <T,>(call: (() => Promise<T>) | undefined): Promise<T | null> => {
        if (!call) return null;
        try {
          return await call();
        } catch (err) {
          // A missing or broken extension must not take the page down.
          if (!isCancellation(err)) {
            console.warn("protocol extension unavailable:", (err as Error).message);
          }
          return null;
        }
      };

      const [bell, teleport, measurements] = await Promise.all([
        optional(() => api.fetchBellState?.(runId, ctx) ?? Promise.resolve(null)),
        optional(() => api.fetchTeleportTrace?.(runId, ctx) ?? Promise.resolve(null)),
        optional(() => api.fetchMeasurements?.(runId, ctx) ?? Promise.resolve(null)),
      ]);
      if (signal.aborted) return;

      set({
        protocol: {
          bell,
          teleport,
          measurements: measurements ?? [],
          provided: { bell: !!bell, teleport: !!teleport, measurements: !!measurements },
        },
        protocolStage: "done",
        maxPage: 6,
      });
    },

    skip() {
      if (!get().running || fastForward) return;
      setFastForward(true);
      set({ fastForward: true });
    },

    /**
     * Re-runs the whole simulation with the same seed — inputs are preserved by
     * restart(), so the identical message, attack and verifier setup are replayed.
     */
    async replay() {
      if (get().running) return;
      get().restart();
      await get().startSimulation();
      await get().toDistribute();
      await get().toHealth();
      if (!get().health?.passed) return;
      get().goToPage(2);
      await get().signMessage();
      get().goToPage(3);
      await get().launchAttack();
      await get().startVerify();
      get().goToPage(5);
    },

    restart() {
      abortOp();
      setFastForward(false);
      const {
        explainMode,
        theme,
        verifierCount,
        init,
        forceChannelFail,
        message,
        attackId,
        intensity,
      } = get();
      set({
        ...initial,
        explainMode,
        theme,
        verifierCount,
        init,
        booting: false,
        forceChannelFail,
        message,
        attackId,
        intensity,
      });
      document.documentElement.classList.toggle("dark", theme === "dark");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  };
});
