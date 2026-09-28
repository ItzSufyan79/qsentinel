import { STAGES, type StageId } from "../api/types";

/** Stepper config for the live pipeline (report 6.1), driven by the run's stage. */
export const STAGE_CONFIG = STAGES.map((s) => ({
  id: s.id,
  num: s.num.toString().padStart(2, "0"),
  label: s.label,
}));

export function stageFromId(id: StageId) {
  return STAGE_CONFIG.find((s) => s.id === id);
}