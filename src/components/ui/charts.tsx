/**
 * Scientific charts — report 7.4. Every chart has a "View as table" fallback
 * and a backend-supplied caption string. No probability, threshold or verdict
 * is derived here; the shapes arrive pre-computed.
 */

import { useEffect, useState } from "react";
import { api } from "../../api";
import type { BinomialResponse, ResultResponse } from "../../api/types";
import { probability } from "../../lib/formatting";

/* ------------------------------------------------------------------ *
 *  Bag distribution — honest vs cheater curves, this run's per-bag dots
 * ------------------------------------------------------------------ */

export function BagDistributionChart({
  binom,
  dots,
  passLine,
  runN,
}: {
  binom: BinomialResponse;
  /** one wrong-count per bag for the displayed verifier(s) */
  dots: number[];
  passLine: number;
  /** the real run's N, always shown as a fixed marker */
  runN: number;
}) {
  const [tab, setTab] = useState<"chart" | "table">("chart");
  const [whatIf, setWhatIf] = useState(false);
  const [n, setN] = useState<number>(runN);
  const [probe, setProbe] = useState<BinomialResponse | null>(null);
  const [probeErr, setProbeErr] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (!whatIf) return;
    let cancelled = false;
    setProbing(true);
    setProbeErr(null);
    api
      .getBinomial(n, binom.pHonest, binom.pCheat)
      .then((d) => {
        if (!cancelled) setProbe(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setProbeErr(e instanceof Error ? e.message : "Binomial endpoint unavailable");
      })
      .finally(() => {
        if (!cancelled) setProbing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [whatIf, n, binom.pHonest, binom.pCheat]);

  const data = probe ?? binom;
  const labelled = probe !== null;

  const maxY = Math.max(
    1e-6,
    ...data.honest.map((v, i) => Math.max(v, data.cheater[i])),
  );

  const W = 660;
  const H = 260;
  const PAD = { l: 40, r: 14, t: 14, b: 30 };
  const x = (v: number) => PAD.l + (v / data.n) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / maxY) * (H - PAD.t - PAD.b);

  const path = (arr: number[]) =>
    arr
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-3 text-[12px] text-n-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-pass" /> honest
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-n-500" /> cheater
          </span>
        </div>
        <div className="ml-auto">
          <label className="display text-[12px] text-n-500 uppercase">
            <input
              type="checkbox"
              checked={whatIf}
              onChange={(e) => setWhatIf(e.target.checked)}
              className="mr-1.5 accent-[var(--qs-primary)]"
            />
            What-if N explorer
          </label>
        </div>
      </div>

      {whatIf && (
        <div className="card-muted space-y-2 p-4" role="group" aria-label="What-if selector">
          <p className="caption-text !text-[13px]">
            Does not change this run. Slots per bag <span className="num">{n}</span> (real run:{" "}
            <span className="num">{runN}</span>).
          </p>
          <input
            type="range"
            min={16}
            max={512}
            step={8}
            value={n}
            disabled={probing}
            onChange={(e) => setN(Number(e.target.value))}
            aria-label="Slots per bag, what-if"
            className="w-full accent-[var(--qs-primary)]"
          />
          {probing && <p className="micro text-n-500">computing exact binomial…</p>}
          {probeErr && <p className="text-[13px] text-fail-ink">{probeErr} · <button type="button" className="underline" onClick={() => setProbe(null)}>retry</button></p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="ml-auto flex rounded-[var(--qs-r)] border border-outline-strong p-0.5">
          {(["chart", "table"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`display rounded-[var(--qs-r-sm)] px-2.5 py-1 text-[12px] tracking-[0.05em] uppercase ${tab === t ? "bg-primary text-on-primary" : "text-n-600 hover:text-on-bg"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "table" ? (
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            <tr className="border-b border-outline">
              <th className="py-1.5 pr-3 text-left font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">Honest</th>
              <td className="py-1.5 text-right">Binomial({data.n}, {data.pHonest})</td>
            </tr>
            <tr className="border-b border-outline">
              <th className="py-1.5 pr-3 text-left font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">Cheater</th>
              <td className="py-1.5 text-right">Binomial({data.n}, {data.pCheat})</td>
            </tr>
            <tr className="border-b border-outline">
              <th className="py-1.5 pr-3 text-left font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">Pass line</th>
              <td className="py-1.5 text-right num">&lt; {probe?.passLine ?? passLine} wrong of {data.n}</td>
            </tr>
            <tr className="border-b border-outline">
              <th className="py-1.5 pr-3 text-left font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">False rejection (design)</th>
              <td className="py-1.5 text-right num">{probability(data.falseRejection)}</td>
            </tr>
            <tr>
              <th className="py-1.5 pr-3 text-left font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">False acceptance (design)</th>
              <td className="py-1.5 text-right num">{probability(data.falseAcceptance)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Bag distribution curves with this run's per-bag mismatch dots"
          className="w-full"
        >
          <g className="num" fontSize="12" fill="var(--qs-n-500)">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y(t * maxY)}
                  y2={y(t * maxY)}
                  stroke="var(--qs-n-200)"
                  strokeDasharray="2 3"
                />
                <text x={PAD.l - 6} y={y(t * maxY) + 4} textAnchor="end">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
          </g>
          <path d={path(data.honest)} fill="none" stroke="var(--qs-pass)" strokeWidth="2" />
          <path d={path(data.cheater)} fill="none" stroke="var(--qs-n-500)" strokeWidth="2" strokeDasharray="5 4" />
          {/* pass line */}
          <line
            x1={x(passLine)}
            x2={x(passLine)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--qs-ink)"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          <text x={x(passLine) + 3} y={PAD.t + 4} className="num" fontSize="12" fill="var(--qs-ink)">
            pass &lt; {probe?.passLine ?? passLine}
          </text>
          {/* this run's dots */}
          {dots.map((w, i) => (
            <circle
              key={i}
              cx={x(w)}
              cy={H - PAD.b - 5}
              r={2.5}
              fill={w >= (probe?.passLine ?? passLine) ? "var(--qs-fail)" : "var(--qs-pass)"}
            />
          ))}
          <text x={PAD.l} y={H - 8} className="num" fontSize="12" fill="var(--qs-n-500)">
            wrong slots per bag (0 → {data.n})
          </text>
        </svg>
      )}

      {!labelled && (
        <p className="micro text-n-500">
          Callout numbers for this run: false rejection ≈ {probability(data.falseRejection)}, false
          acceptance ≈ {probability(data.falseAcceptance)} (design calculations under the assumed
          error rates).
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Z/X/Y fingerprint — grouped bars with the matched ghost pattern
 * ------------------------------------------------------------------ */

export function FingerprintChart({
  rates,
  match,
}: {
  rates: { Z: number; X: number; Y: number };
  match: NonNullable<ResultResponse["verdictBanner"]["fingerprintMatch"]>;
}) {
  const ghost = match.library.find((l) => l.id === match.best);
  const [gz, gx, gy] = ghost?.profile ?? [0, 0, 0];
  const maxV = Math.max(1, rates.Z, rates.X, rates.Y, ...(ghost?.profile ?? []));

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 340 200" role="img" aria-label="Error rate per basis with the closest attack pattern" className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1="40" x2="330" y1={178 - t * 150} y2={178 - t * 150} stroke="var(--qs-n-200)" strokeDasharray="2 3" />
            <text x="34" y={182 - t * 150} textAnchor="end" className="num" fontSize="12" fill="var(--qs-n-500)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {(
          [
            { key: "Z", v: rates.Z, g: gz, x: 80 },
            { key: "X", v: rates.X, g: gx, x: 185 },
            { key: "Y", v: rates.Y, g: gy, x: 290 },
          ] as const
        ).map(({ key, v, g, x }) => {
          const bh = (v / maxV) * 150;
          return (
            <g key={key}>
              <rect x={x - 22} y={178 - bh} width={44} height={bh} rx="1" fill={key === "Y" && g < 0.1 ? "var(--qs-pass)" : "var(--qs-primary)"} />
              {/* measured ghost marker */}
              <polygon
                points={`${x},${178 - (g / maxV) * 150 - 8} ${x + 7},${178 - (g / maxV) * 150} ${x},${178 - (g / maxV) * 150 + 8} ${x - 7},${178 - (g / maxV) * 150}`}
                fill="var(--qs-n-800)"
                stroke="var(--qs-n-700)"
              />
              <text x={x} y="196" textAnchor="middle" className="display" fontSize="12" fill="var(--qs-n-600)">
                {key} basis
              </text>
              <text x={x} y={178 - bh - 8} textAnchor="middle" className="num" fontSize="12" fill="var(--qs-ink)">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        <text x="40" y="20" className="num" fontSize="12" fill="var(--qs-n-500)">
          ▲ ghost: {ghost?.label}
        </text>
      </svg>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-outline text-left">
            <th className="py-1.5 font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">Library pattern</th>
            <th className="py-1.5 text-right font-display text-[12px] tracking-[0.05em] text-n-500 uppercase">Distance</th>
          </tr>
        </thead>
        <tbody>
          {match.library.map((l) => (
            <tr key={l.id} className={`border-b border-outline last:border-0 ${l.id === match.best ? "bg-pass-tint" : ""}`}>
              <td className={`py-1.5 ${l.id === match.best ? "font-semibold text-pass-ink" : "text-n-600"}`}>
                {l.label}
                {l.id === match.best && <span className="micro ml-2">best match</span>}
                {l.id === match.runnerUp && <span className="micro ml-2">runner-up</span>}
              </td>
              <td className={`num py-1.5 text-right ${l.id === match.best ? "font-semibold text-pass-ink" : "text-n-600"}`}>
                {l.distance.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Detection vs intensity — Partial only
 * ------------------------------------------------------------------ */

export function DetectionCurveChart({
  curve,
}: {
  curve: NonNullable<ResultResponse["verdictBanner"]["detectionCurve"]>;
}) {
  const { intensities, perBag, signature, chosenIndex, perBagAt, signatureAt } = curve;
  const W = 640;
  const H = 240;
  const PAD = { l: 42, r: 14, t: 14, b: 30 };
  const x = (i: number) => PAD.l + (i / 100) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - v * (H - PAD.t - PAD.b);

  const line = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(intensities[i]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Detection probability against attack intensity" className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--qs-n-200)" strokeDasharray="2 3" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="num" fontSize="12" fill="var(--qs-n-500)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <path d={line(perBag)} fill="none" stroke="var(--qs-n-600)" strokeWidth="2" strokeDasharray="5 4" />
        <path d={line(signature)} fill="none" stroke="var(--qs-primary)" strokeWidth="2.5" />
        {/* chosen intensity marker */}
        <line x1={x(intensities[chosenIndex])} x2={x(intensities[chosenIndex])} y1={PAD.t} y2={H - PAD.b} stroke="var(--qs-fail)" strokeWidth="1.5" />
        <circle cx={x(intensities[chosenIndex])} cy={y(signatureAt)} r="4" fill="var(--qs-fail)" />
        <circle cx={x(intensities[chosenIndex])} cy={y(perBagAt)} r="4" fill="var(--qs-n-600)" />
        <text x={x(intensities[chosenIndex]) + 4} y={PAD.t + 4} className="num" fontSize="12" fill="var(--qs-fail)">
          your intensity {intensities[chosenIndex]}%
        </text>
        <text x={PAD.l} y={H - 8} className="num" fontSize="12" fill="var(--qs-n-500)">
          attack intensity %
        </text>
        <text x={W - PAD.r} y={20} textAnchor="end" className="num" fontSize="12" fill="var(--qs-n-700)">
          solid = whole signature · dashed = single bag
        </text>
      </svg>
      <p className="micro mt-2 text-n-500">
        At {intensities[chosenIndex]}%: per-bag {perBagAt.toFixed(3)}, whole signature {signatureAt.toFixed(3)}.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  63-bag heatmap — report 7.4 #5
 * ------------------------------------------------------------------ */

export function Heatmap({
  bags,
  passLine,
  changed,
  label,
}: {
  bags: number[];
  passLine: number;
  /** message-substitution badge on the changed positions */
  changed?: boolean[] | null;
  label: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="display text-[12px] tracking-[0.05em] text-n-500 uppercase">{label}</p>
        <span className="flex items-center gap-3 text-[12px] text-n-500">
          <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-[2px] bg-[var(--heat-clean)]" /> 0–3</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-[2px] bg-[var(--heat-mid)]" /> 4–11</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-[2px] bg-[var(--heat-fail)]" /> ≥ {passLine}</span>
        </span>
      </div>
      <div className="heat-grid" role="img" aria-label={`63-bag heatmap, ${label}`}>
        {bags.map((w, i) => {
          const fail = w >= passLine;
          const cell =
            w <= 3 ? "var(--heat-clean)" : w < passLine ? "var(--heat-mid)" : "var(--heat-fail)";
          return (
            <span
              key={i}
              tabIndex={0}
              className="heat-cell"
              style={{ background: cell }}
              aria-label={`Bag ${i + 1}: ${w} wrong of 128, ${fail ? "FAIL" : "pass"}`}
            >
              {fail ? (
                <span aria-hidden className="heat-x">✕</span>
              ) : (
                <span aria-hidden className="heat-num">{w}</span>
              )}
              {changed?.[i] && <span aria-hidden className="heat-pin" title={`changed position ${i + 1}`} />}
            </span>
          );
        })}
      </div>
    </div>
  );
}