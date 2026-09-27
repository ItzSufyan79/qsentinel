import type {
  Amplitude,
  BellStateResponse,
  MeasurementSeries,
  TeleportStep,
  TeleportTrace,
} from "./types";

/**
 * Protocol primitives for the Protocol page.
 *
 * These are *simulated* physics. In the real system the quantum engine owns
 * every number here; the frontend only draws them. The values below are the
 * textbook ones, so the page is honest about what the protocol claims.
 */

const INV_SQRT2 = Number((1 / Math.SQRT2).toPrecision(4));

function amp(label: string, re: number, im = 0): Amplitude {
  return {
    label,
    re,
    im,
    // Precomputed, as the contract requires — the UI never squares anything.
    probability: Number((re * re + im * im).toPrecision(4)),
  };
}

/** |Φ+⟩ = (|00⟩ + |11⟩)/√2 — the state the protocol starts from. */
export function bellState(): BellStateResponse {
  return {
    formula: "|Φ⁺⟩ = (|00⟩ + |11⟩) / √2",
    label: "Maximally entangled pair",
    basis: ["00", "01", "10", "11"],
    amplitudes: [
      amp("|00⟩", INV_SQRT2),
      amp("|01⟩", 0),
      amp("|10⟩", 0),
      amp("|11⟩", INV_SQRT2),
    ],
    correlationTrials: 10_000,
    // Perfectly correlated pairs, minus the shot noise you always get.
    correlationAgreement: 0.9994,
  };
}

/**
 * The six steps of teleportation. `classicalBits` carries the two bits Alice
 * sends Bob; the correction is the operator Bob applies as a result. This is
 * the whole security argument of a QDS, so it is shown rather than asserted.
 */
export function teleportTrace(): TeleportTrace {
  const steps: TeleportStep[] = [
    {
      index: 0,
      stage: "prepare",
      caption: "Prepare the payload",
      detail:
        "The message qubit is prepared in an unknown superposition |ψ⟩ = α|0⟩ + β|1⟩. Nobody, including the sender, knows α and β.",
      classicalBits: "—",
      correction: "I",
      amplitudes: [amp("|0⟩", 0.6), amp("|1⟩", 0.8)],
    },
    {
      index: 1,
      stage: "share",
      caption: "Share an entangled pair",
      detail:
        "Sender and receiver each hold one half of a pre-shared Bell pair. Neither half carries information on its own.",
      classicalBits: "—",
      correction: "I",
      amplitudes: [amp("|00⟩", INV_SQRT2), amp("|11⟩", INV_SQRT2)],
    },
    {
      index: 2,
      stage: "measure",
      caption: "Sender measures jointly",
      detail:
        "The payload and the sender's half are measured together in the Bell basis. Both outcomes are random, so nothing leaks.",
      classicalBits: "—",
      correction: "I",
      amplitudes: [amp("Φ±", 0.5), amp("Ψ±", 0.5)],
    },
    {
      index: 3,
      stage: "classify",
      caption: "Two classical bits sent",
      detail:
        "The sender reads the measurement outcome and sends two classical bits. They reveal which error occurred, not what the message was.",
      classicalBits: "1 0",
      correction: "X",
      amplitudes: [amp("|1⟩", 0.8), amp("|0⟩", 0.6)],
    },
    {
      index: 4,
      stage: "correct",
      caption: "Receiver applies correction",
      detail:
        "The receiver applies the Pauli operator named by those two bits. The state is now identical to the original payload.",
      classicalBits: "1 0",
      correction: "X",
      amplitudes: [amp("|0⟩", 0.6), amp("|1⟩", 0.8)],
    },
    {
      index: 5,
      stage: "done",
      caption: "State recovered exactly",
      detail:
        "The payload is intact without ever having been copied. In a quantum digital signature this is repeated per block.",
      classicalBits: "—",
      correction: "I",
      amplitudes: [amp("|0⟩", 0.6), amp("|1⟩", 0.8)],
    },
  ];

  return {
    inputState: "|ψ⟩ = 0.6|0⟩ + 0.8|1⟩",
    steps,
    statePreserved: true,
  };
}

/**
 * Projective measurement distributions. Z is the computational basis and
 * should be sharply peaked for |0⟩; X and Y are superposition bases and
 * should come out flat. The deviation is what the threshold rule reads.
 */
export function measurementSeries(): MeasurementSeries[] {
  const shots = 4096;

  const z: MeasurementSeries = {
    id: "z",
    title: "Computational basis",
    basis: "Z",
    shots,
    bins: [
      { outcome: "|0⟩", count: 4096 },
      { outcome: "|1⟩", count: 0 },
    ],
    expected: [4096, 0],
    deviation: 0,
    verdict: "match",
  };

  const x: MeasurementSeries = {
    id: "x",
    title: "Superposition basis",
    basis: "X",
    shots,
    bins: [
      { outcome: "+", count: 2071 },
      { outcome: "−", count: 2025 },
    ],
    // |+⟩ and |−⟩ are equally likely in the X basis.
    expected: [2048, 2048],
    deviation: 0.024,
    verdict: "match",
  };

  const y: MeasurementSeries = {
    id: "y",
    title: "Phase basis",
    basis: "Y",
    shots,
    bins: [
      { outcome: "+i", count: 2118 },
      { outcome: "−i", count: 1978 },
    ],
    expected: [2048, 2048],
    deviation: 0.031,
    verdict: "match",
  };

  return [z, x, y];
}
