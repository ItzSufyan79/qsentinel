import { useParams } from "react-router-dom";

/**
 * The `:runId` route param, shared by the run-scoped pages (Live Run,
 * Results, Arbitration). Lives here rather than in App so App only exports
 * a component.
 */
export function useRunId(): string {
  const { runId } = useParams<{ runId: string }>();
  return runId ?? "";
}
