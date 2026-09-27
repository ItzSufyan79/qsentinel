import type { MeasurementSeries } from "../../api/types";
import { Chip } from "../ui/atoms";

/**
 * Projective measurement: observed counts against the distribution a
 * legitimate run must produce. The deviation and the verdict are the
 * backend's, not ours.
 */
export function MeasurementHistogram({ series }: { series: MeasurementSeries[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {series.map((s) => {
        const max = Math.max(...s.bins.map((b) => b.count), ...s.expected, 1);
        return (
          <figure key={s.id} className="min-w-0">
            <figcaption className="flex items-baseline justify-between gap-2">
              <span className="micro">{s.title}</span>
              <Chip tone={s.verdict === "match" ? "pass" : "fail"}>{s.basis}</Chip>
            </figcaption>

            {/* observed vs expected, paired bars */}
            <div className="mt-3 space-y-2">
              {s.bins.map((bin) => {
                const expected = s.expected[s.bins.indexOf(bin)] ?? 0;
                return (
                  <div key={bin.outcome}>
                    <div className="flex items-baseline justify-between">
                      <span className="num text-[11px] text-on-bg">{bin.outcome}</span>
                      <span className="num text-[10px] text-n-500">
                        {bin.count.toLocaleString("en-US")}
                      </span>
                    </div>
                    {/* observed */}
                    <div className="mt-1 h-2.5 border border-outline">
                      <div
                        className="h-full transition-[width] duration-500"
                        style={{
                          width: `${(bin.count / max) * 100}%`,
                          background: "var(--qs-primary)",
                        }}
                      />
                    </div>
                    {/* expected, as a tick on the same axis */}
                    <div
                      className="relative h-1.5"
                      title={`expected ${expected.toLocaleString("en-US")}`}
                    >
                      <span
                        className="absolute top-0 h-full w-px bg-n-400"
                        style={{ left: `${(expected / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <dl className="mt-3 space-y-1 border-t border-outline pt-2">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="micro">Shots</dt>
                <dd className="num text-[11px] text-n-600 dark:text-n-700">
                  {s.shots.toLocaleString("en-US")}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="micro">Deviation</dt>
                <dd className="num text-[11px] text-n-600 dark:text-n-700">
                  {s.deviation.toFixed(3)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="micro">Verdict</dt>
                <dd
                  className="num text-[11px] font-semibold"
                  style={{
                    color: s.verdict === "match" ? "var(--qs-pass)" : "var(--qs-fail)",
                  }}
                >
                  {s.verdict}
                </dd>
              </div>
            </dl>
          </figure>
        );
      })}
    </div>
  );
}
