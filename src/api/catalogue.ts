/**
 * Attack scenario catalogue — static, identical for every backend.
 *
 * Lives outside `mockApi.ts` and `client.ts` because it is configuration, not
 * simulation: the two backends describe the same eight scenarios, so the
 * picker in `Page3Attack.tsx` imports from here.
 */

import type { AttackId } from "./types";

export interface AttackOption {
  id: AttackId;
  title: string;
  blurb: string;
  hasSlider?: boolean;
}

export const ATTACK_CATALOGUE: AttackOption[] = [
  { id: "none", title: "No Attack", blurb: "Honest run — nothing interferes." },
  {
    id: "forgery",
    title: "Forgery",
    blurb: "Attacker tries to sign a different message.",
  },
  {
    id: "impersonation",
    title: "Impersonation",
    blurb: "Attacker pretends to be the sender.",
  },
  {
    id: "replay",
    title: "Replay",
    blurb: "Attacker captured an old signature and is trying to reuse it.",
  },
  {
    id: "intercept-fixed",
    title: "Intercept-Resend (Fixed Basis)",
    blurb: "Attacker measures every state in one fixed basis and resends.",
  },
  {
    id: "intercept-random",
    title: "Intercept-Resend (Random Basis)",
    blurb: "Attacker measures in a randomly chosen basis each time.",
  },
  {
    id: "tampering",
    title: "Signal Tampering",
    blurb: "Attacker alters the data in transit.",
  },
  {
    id: "partial",
    title: "Partial Attack",
    blurb: "Attacker interferes with only some of the data.",
    hasSlider: true,
  },
];

export const ATTACK_IDS = ATTACK_CATALOGUE.map((option) => option.id);
