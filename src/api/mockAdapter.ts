/**
 * Mock implementation of `QdsApi`, backed by `mockApi.ts`.
 *
 * Default mode. The synthetic keygen/distribution streams live here rather
 * than in the store, so that when the real backend arrives the store's code is
 * identical in both modes — only this file goes away.
 *
 * The numbers produced here are layout fixtures, not cryptography.
 */

import { sleep } from "../lib/async";
import * as sim from "./mockApi";
import type { QdsApi, RunContext, VerificationPlan } from "./contract";
import type { VerifierTarget } from "./types";

/** One animation frame of progress, honouring fast-forward and abort. */
function tick(ctx?: RunContext): Promise<void> {
  return sleep(26, { signal: ctx?.signal, speed: ctx?.speed });
}

export const mockApi: QdsApi = {
  async init(seed, _ctx) {
    const response = await sim.init();
    return seed === undefined ? response : { ...response, seed };
  },

  keygen(_runId, _ctx) {
    return Promise.resolve(sim.keygen());
  },

  async streamKeygen(_runId, onProgress, ctx) {
    const { totalSlots: total } = sim.keygen();
    const steps = 48;
    for (let i = 1; i <= steps; i += 1) {
      await tick(ctx);
      if (ctx?.signal?.aborted) return;
      onProgress(Math.round((total * i) / steps), total, i === steps);
    }
  },

  distribute(_runId, verifierCount) {
    return Promise.resolve(sim.distribute(verifierCount));
  },

  async streamDistribution(_runId, verifiers, onProgress, ctx) {
    const { totalSlots: total } = sim.keygen();
    const steps = 40;
    const stagger = 5;

    const rows: VerifierTarget[] = verifiers.map((name) => ({
      name,
      received: 0,
      total,
      done: false,
    }));

    for (let i = 1; i <= steps; i += 1) {
      await tick(ctx);
      if (ctx?.signal?.aborted) return;

      const next = rows.map((row, vi) => {
        // each verifier starts a beat later, but all must finish together
        const delay = vi * stagger;
        const span = Math.max(1, steps - delay);
        const progress = Math.min(1, Math.max(0, (i - delay) / span));
        return {
          ...row,
          received: Math.round(row.total * progress),
          done: progress >= 1,
        };
      });

      onProgress(next);
      if (next.every((row) => row.done)) return;
    }
  },

  channelHealth(_runId, ctx) {
    return sim.channelHealth({}, { forceFail: ctx?.forceFail });
  },

  sign(_runId, message, verifierNames, ctx) {
    return sim.sign(message, verifierNames, ctx);
  },

  launchAttack(_runId, attackId, intensity, ctx) {
    return sim.launchAttack(attackId, intensity, ctx);
  },

  planVerification(_runId, verifierNames, attackId, intensity, seed) {
    return Promise.resolve(
      sim.planVerification(verifierNames, attackId, intensity, seed),
    ) as Promise<VerificationPlan>;
  },

  streamVerification(_runId, plan, results, onEvent, ctx) {
    return sim.streamVerification(plan, results, onEvent, ctx);
  },

  agreementFor(_runId, results) {
    return Promise.resolve(sim.agreementFor(results));
  },

  buildReport(_runId, verifierNames, results, attack, channelScore, seed) {
    return Promise.resolve(
      sim.buildReport(
        verifierNames,
        results,
        attack,
        channelScore,
        seed,
        new Date().toISOString(),
      ),
    );
  },

  buildLogs(_runId, attack, results, channelScore, startedAt) {
    return Promise.resolve(sim.buildLogs(attack, results, channelScore, startedAt));
  },

  fetchEvidence(_runId, report) {
    return sim.fetchEvidence(report);
  },
};
