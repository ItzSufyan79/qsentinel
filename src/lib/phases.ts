export const PHASES = [
  { id: "keygen", label: "Key Generation" },
  { id: "distribution", label: "Distribution" },
  { id: "signing", label: "Signing" },
  { id: "verification", label: "Verification" },
  { id: "result", label: "Result" },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

export const PHASE_ORDER: PhaseId[] = PHASES.map((p) => p.id);
