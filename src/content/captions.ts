import type { ExplainMode } from "../api/types";

/** Two variants for every caption in the app (spec §7.3). */
interface CaptionText {
  simple: string;
  technical: string;
}

export const CAPTIONS = {
  "p1-setup": {
    simple:
      "You're about to create a secret key that only the sender knows. This will later be split into pieces and sent to your checkers (verifiers).",
    technical:
      "Pre-distribution phase. A key pool is provisioned before any message exists, sized by the selected verifier count and the fixed hardware profile.",
  },
  "p1-keygen": {
    simple:
      "Each piece of the secret is sealed individually — like putting a coin in a locked box. There are 16,128 boxes in total, but only some will ever be opened.",
    technical:
      "63 codeword positions × 2 blocks × 128 slots = 16,128 quantum states generated, each independently keyed to one of six Pauli eigenstates.",
  },
  "p1-distribute": {
    simple:
      "The sealed boxes are now being delivered to each checker. Each checker gets their own full set — no one is sharing or passing boxes to each other.",
    technical:
      "Per-verifier independent distribution. Each target receives an entangled copy of the full key pool; no verifier-to-verifier transfer occurs.",
  },
  "p1-health": {
    simple:
      "Before signing anything, the system tests a few boxes to make sure nobody tampered with the delivery. If tampering is found, everything stops here — better safe than sorry.",
    technical:
      "Statistical sample of delivered slots is measured against expected statistics. Deviation beyond tolerance marks the channel as untrusted and halts the run.",
  },
  "p1-health-explainer": {
    simple:
      "The system picks a small sample of the delivered boxes, opens them, and checks that the results look statistically normal. If somebody had swapped boxes on the way, the sample would look wrong — and the whole run stops before any message is signed.",
    technical:
      "A subset of transmitted slots is measured in a random basis and compared against the expected distribution. A deviation score above the tolerance band flags the channel as compromised, because measurement statistics shift measurably once an intercepting party interacts with the states.",
  },
  "p2-encode": {
    simple:
      "Signing means the sender reveals just enough secret pieces to prove they wrote this exact message — never more than needed.",
    technical:
      "The message is expanded to a fixed-length codeword so any single-character edit changes the entire block pattern, then one block is opened per bit position.",
  },
  "p3-none": {
    simple:
      "Nothing is interfering this time — let's see how a normal, honest signature checks out.",
    technical:
      "Baseline run. No adversary interaction is modelled on the channel; results should fall within expected honest parameters.",
  },
  "p3-attack": {
    simple:
      "An attacker is now trying to interfere. Watch what they can and can't actually access.",
    technical:
      "A simulated adversary interacts with the channel. Review the access panel: everything outside the “has access” column remains computationally unreachable.",
  },
  "p4-verify": {
    simple:
      "Each checker independently tests their own copy. If even one part looks wrong, that checker rejects the signature.",
    technical:
      "Per-block mismatch counting against a fixed threshold, evaluated independently by each verifier against its own key material.",
  },
  "p5-heatmap": {
    simple:
      "Each square is one part of your message. Lighter means it was untouched; darker means more errors were found there.",
    technical:
      "Per-block error density across the 63 codeword positions. Concentrated dark bands indicate targeted interference rather than random noise.",
  },
} satisfies Record<string, CaptionText>;

export type CaptionId = keyof typeof CAPTIONS;

export function caption(id: CaptionId, mode: ExplainMode): string {
  return CAPTIONS[id][mode];
}
