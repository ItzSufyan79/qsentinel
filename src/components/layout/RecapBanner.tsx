import { useMemo } from "react";
import { useFlow } from "../../state/flowStore";

/** One line summarising the previous page's outcome (spec §1.1). */
export function RecapBanner() {
  const page = useFlow((s) => s.page);
  const health = useFlow((s) => s.health);
  const signature = useFlow((s) => s.signature);
  const attack = useFlow((s) => s.attack);
  const verifierResults = useFlow((s) => s.verifierResults);

  const text = useMemo(() => {
    if (page === 1 || !health) return null;
    switch (page) {
      case 2:
        return `Channel health check ${health.passed ? "passed" : "failed"} — score ${health.score.toFixed(2)} / 1.00`;
      case 3:
        return signature
          ? `Message signed. Signature dispatched to ${signature.sentTo.length} verifier${signature.sentTo.length === 1 ? "" : "s"}.`
          : null;
      case 4:
        return attack
          ? `Attack selected: ${attack.label}${attack.intensity !== null ? ` at ${attack.intensity}% intensity` : ""}`
          : null;
      case 5: {
        const accepted = verifierResults.filter((r) => r.verdict === "accepted").length;
        return `Verification complete — ${accepted}/${verifierResults.length} accepted.`;
      }
      default:
        return null;
    }
  }, [page, health, signature, attack, verifierResults]);

  if (!text) return null;

  return (
    <div className="animate-fade-up px-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center gap-3 border-y border-outline py-1.5">
        <span className="micro shrink-0 text-accent-ink">log</span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-outline-strong" />
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.02em] text-n-600 dark:text-n-700">
          {text}
        </p>
      </div>
    </div>
  );
}
