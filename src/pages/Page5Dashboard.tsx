import { useState } from "react";
import { useFlow } from "../state/flowStore";
import { api } from "../api";
import { Banner, Chip, Panel, Skeleton, Stamp } from "../components/ui/atoms";
import { Icon } from "../components/ui/Icon";
import { BarCompare, RocChart } from "../components/viz/AnalyticsCharts";
import { FingerprintChart } from "../components/viz/FingerprintChart";
import { HealthGauge } from "../components/viz/HealthGauge";
import { Heatmap } from "../components/viz/Heatmap";

type Tab = "overview" | "analytics" | "logs";

const TABS: { id: Tab; label: string; code: string; icon: "layers" | "activity" | "terminal" }[] = [
  { id: "overview", label: "Overview", code: "A", icon: "layers" },
  { id: "analytics", label: "Analytics", code: "B", icon: "activity" },
  { id: "logs", label: "Logs", code: "C", icon: "terminal" },
];

export function Page5Dashboard() {
  const store = useFlow();
  const [tab, setTab] = useState<Tab>("overview");
  const [exporting, setExporting] = useState(false);
  const report = store.report;

  if (!report) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  const accepted = report.summary.verdict === "accepted";
  const confidence = Math.round(report.classification.confidence * 100);

  const downloadEvidence = async () => {
    setExporting(true);
    try {
      const blob = await api.fetchEvidence(store.init?.runId ?? "", report);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `qsentinel-evidence-${report.summary.seed}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6">
      {/* masthead */}
      <div className="flex flex-wrap items-end gap-3 border-b border-outline-strong pb-3">
        <div className="mr-auto">
          <p className="micro">§7 · run analysis</p>
          <h1 className="mt-1.5 font-mono text-xl font-semibold tracking-[0.14em] text-on-bg uppercase">
            Run Report
          </h1>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={exporting}
          onClick={() => void downloadEvidence()}
        >
          <Icon name="download" size={15} />
          {exporting ? "Preparing…" : "Evidence Report"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={store.running}
          onClick={() => void store.replay()}
          title="Same seed, same results — for reliable live demos"
        >
          <Icon name="rotate" size={15} />
          {store.running ? "Replaying…" : "Replay Scenario"}
        </button>
      </div>

      {/* summary strip */}
      <Panel plain>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Stamp
            tone={accepted ? "pass" : "fail"}
            title={accepted ? "ACCEPTED" : "REJECTED"}
            sub="overall result"
            className="min-w-52"
          />
          <Fact label="Attack simulated" value={report.summary.attackLabel} />
          <Fact label="Verifiers" value={`${report.summary.verifierCount}`} />
          <Fact
            label="Timestamp"
            value={new Date(report.summary.timestamp).toLocaleString()}
          />
          <Fact label="Seed" value={`${report.summary.seed}`} mono />
        </div>
      </Panel>

      {/* tabs — square segmented track, mono labels */}
      <div
        className="flex border border-outline-strong"
        role="tablist"
        aria-label="Report sections"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`flex flex-1 items-center justify-center gap-2 border-r border-outline-strong px-3 py-2 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase transition-colors duration-200 last:border-r-0 ${
                active
                  ? "bg-primary text-on-primary"
                  : "bg-surface text-n-500 hover:bg-n-100 hover:text-on-bg"
              }`}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            kicker="§7.1"
            title="Attack Classification"
            className={report.classification.honest ? "" : "animate-fade-up"}
          >
            <p
              className="stamp-label text-[15px]"
              style={{
                color: report.classification.honest ? "var(--qs-pass)" : "var(--qs-fail)",
              }}
            >
              {report.classification.honest ? "" : "Detected: "}
              {report.classification.label}
            </p>

            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="micro">Confidence</span>
                <span className="num text-[11px] font-semibold text-on-bg">
                  {confidence}%
                </span>
              </div>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{
                    width: `${confidence}%`,
                    background: report.classification.honest
                      ? "var(--qs-pass)"
                      : "var(--qs-fail)",
                  }}
                />
              </div>
            </div>

            <p className="mt-4 border-t border-outline pt-3 text-[13.5px] leading-relaxed text-n-600 dark:text-n-700">
              {report.classification.explanation}
            </p>
          </Panel>

          <Panel
            kicker="§7.2"
            title="Channel Health Recap"
            subtitle="Recorded at the start of this run"
          >
            <div className="flex justify-center pt-2">
              <HealthGauge health={store.health} measuring={false} />
            </div>
          </Panel>

          <Panel
            kicker="§7.3"
            title="Fingerprint Chart"
            subtitle="Three error statistics, labelled plainly"
            className="lg:col-span-2"
          >
            <FingerprintChart
              axes={report.fingerprint}
              legend={report.fingerprintLegend}
              currentAttack={store.attackId}
            />
          </Panel>

          <Panel
            kicker="§7.4"
            title="Block Heatmap"
            subtitle="Where in the message the errors landed"
            className="lg:col-span-2"
          >
            <Heatmap values={report.heatmap} />
          </Panel>
        </div>
      )}

      {tab === "analytics" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel kicker="§7.5" title="Detection rate vs. false alarm rate">
            <RocChart points={report.analytics.roc} axis={report.analytics.rocAxis} loading={false} />
            <p className="micro mt-3 border-t border-outline pt-2.5 leading-relaxed">
              Every point is supplied by the backend — nothing is derived on the client.
            </p>
          </Panel>
          <Panel kicker="§7.6" title="This run vs. expected behaviour">
            <BarCompare data={report.analytics.bars} loading={false} />
            <p className="micro mt-3 border-t border-outline pt-2.5 leading-relaxed">
              Distance from the honest bar is what drives the classification.
            </p>
          </Panel>
        </div>
      )}

      {tab === "logs" && (
        <Panel
          kicker="§7.7"
          title="Event Log"
          subtitle="Each entry is cryptographically chained to the previous one, so the log is tamper-evident."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-outline-strong text-left">
                  <th className="micro py-2 pr-4">Timestamp</th>
                  <th className="micro py-2 pr-4">Event</th>
                  <th className="micro py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {store.logs.map((row, i) => (
                  <tr
                    key={`${row.timestamp}-${i}`}
                    className="border-b border-outline/60 transition-colors hover:bg-n-100/60 dark:hover:bg-white/5"
                  >
                    <td className="num py-2.5 pr-4 text-[11px] whitespace-nowrap text-n-500">
                      {row.timestamp}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Chip tone="neutral">{row.type}</Chip>
                    </td>
                    <td className="py-2.5 text-[13px] text-on-bg">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Banner tone="brand" title="This is a simulation">
        Results are reported as detected / rejected / within expected parameters. The system
        makes no claim of preventing every attack.
      </Banner>
    </div>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="micro">{label}</p>
      <p
        className={`mt-1.5 text-[13px] font-semibold text-on-bg ${mono ? "num text-[12px]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
