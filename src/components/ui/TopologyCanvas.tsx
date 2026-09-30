/**
 * Network topology canvas — report section 6.2. Pure SVG driven by the live
 * stage and the attack configuration. No numbers here; the numbers live in the
 * stage panels. Eve is always visible while an attack is configured, and the
 * tapped edge is marked in red so the reader sees exactly where she sits.
 */

import type { AttackTypeId, StageId, TamperingSubtype, TargetLink } from "../../api/types";
import { attackLabel, tamperingLabel } from "../../api/types";

interface Props {
  stage: StageId | null;
  attack: AttackTypeId;
  subtype: TamperingSubtype | null;
  targetLink: TargetLink;
}

const ALICE = { x: 120, y: 155 } as const;
const BOB = { x: 462, y: 76 } as const;
const CHARLIE = { x: 462, y: 292 } as const;
const EVE = { x: 294, y: 174, r: 22 } as const;

interface EdgeDef {
  id: string;
  kind: "quantum" | "classical";
  to: "bob" | "charlie";
  d: string;
  /** curve midpoint (t = 0.5) — where Eve taps */
  mid: readonly [number, number];
}

/**
 * One quantum + one classical channel per verifier. Endpoints sit on the node
 * rims; the classical arc bows outside the quantum arc so the four paths never
 * cross. `labelAt` splits the two labels of each pair apart along the curve.
 */
const EDGES: EdgeDef[] = [
  { id: "qb", kind: "quantum", to: "bob", d: "M 155 147 Q 293 100 428 84", mid: [292, 108] },
  { id: "cb", kind: "classical", to: "bob", d: "M 151 137 Q 294 30 427 68", mid: [292, 66] },
  { id: "qc", kind: "quantum", to: "charlie", d: "M 153 168 Q 294 245 429 279", mid: [292, 234] },
  { id: "cc", kind: "classical", to: "charlie", d: "M 148 178 Q 294 330 429 306", mid: [291, 286] },
];

const LABEL_AT: Record<string, string> = { qb: "68%", cb: "30%", qc: "68%", cc: "30%" };

export function TopologyCanvas({ stage, attack, subtype, targetLink }: Props) {
  const hasAttack = attack !== "no-attack";

  /** Which channel type Eve tapped this attack type. */
  const quantumTap = subtype === "fixed-basis" || subtype === "random-basis" || subtype === "partial";
  const classicalTap =
    attack === "forgery" || subtype === "message-substitution" || subtype === "correction-bit";

  const animateQuantum = stage === "distribute" || stage === "verify" || stage === "sign";

  const active = (on: StageId | StageId[]) =>
    (Array.isArray(on) ? on : [on]).includes(stage as StageId);

  const isTapped = (e: EdgeDef) =>
    hasAttack &&
    ((e.kind === "quantum" && quantumTap) || (e.kind === "classical" && classicalTap)) &&
    (targetLink === "both" || targetLink === e.to);

  const connector = (e: EdgeDef) => {
    const dx = e.mid[0] - EVE.x;
    const dy = e.mid[1] - EVE.y;
    const len = Math.hypot(dx, dy);
    return {
      x1: EVE.x + (dx / len) * (EVE.r + 3),
      y1: EVE.y + (dy / len) * (EVE.r + 3),
      x2: e.mid[0],
      y2: e.mid[1],
    };
  };

  return (
    <figure className="topology" aria-label="Device topology">
      <svg viewBox="0 0 620 360" className="w-full" role="img" aria-hidden="true">
        {/* channels: solid = quantum state, dashed = classical */}
        {EDGES.map((e) => {
          const red = isTapped(e);
          const on = active(e.kind === "quantum" ? ["distribute", "sign", "verify"] : ["sign", "verify"]);
          const href = `#qs-edge-${e.id}`;
          return (
            <g key={e.id}>
              <path
                id={`qs-edge-${e.id}`}
                d={e.d}
                fill="none"
                stroke={red ? "var(--qs-fail)" : on ? "var(--qs-ink)" : "var(--qs-n-500)"}
                strokeWidth={red ? 2.5 : on ? 2 : 1.25}
                strokeDasharray={red ? "6 4" : e.kind === "quantum" ? undefined : "5 4"}
              />
              {animateQuantum && e.kind === "quantum" && (
                <circle r="3.5" fill="var(--qs-primary)">
                  <animateMotion dur="1.1s" repeatCount="indefinite">
                    <mpath href={href} />
                  </animateMotion>
                </circle>
              )}
              <text className="topo-label" dy="-5">
                <textPath href={href} startOffset={LABEL_AT[e.id]}>
                  {e.kind}
                </textPath>
              </text>
            </g>
          );
        })}

        {/* Eve's wires: from her node to the tap point on each tampered channel */}
        {EDGES.filter(isTapped).map((e) => (
          <g key={`tap-${e.id}`}>
            <line
              {...connector(e)}
              stroke="var(--qs-fail)"
              strokeWidth={2.5}
              strokeDasharray="6 4"
            />
            <circle cx={e.mid[0]} cy={e.mid[1]} r={4} fill="var(--qs-fail)" />
          </g>
        ))}

        {/* Alice */}
        <g transform={`translate(${ALICE.x} ${ALICE.y})`}>
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Alice</text>
          <text y="20" textAnchor="middle" className="topo-role">sender</text>
          {active("fidelity") && <circle r="40" fill="none" stroke="var(--qs-primary)" strokeWidth="1.5" strokeDasharray="4 3" />}
        </g>

        {/* Bob */}
        <g transform={`translate(${BOB.x} ${BOB.y})`}>
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Bob</text>
          <text y="20" textAnchor="middle" className="topo-role">verifier</text>
          {(targetLink === "bob" || targetLink === "both") && hasAttack && attack !== "impersonation" && (
            <path d="M -44 0 A 44 44 0 0 1 44 0" fill="none" stroke="var(--qs-fail)" strokeWidth="2" strokeDasharray="4 3" transform="translate(0 12)" />
          )}
          {active(["verify", "analysis"]) && <circle r="40" fill="none" stroke="var(--qs-secondary)" strokeWidth="1.5" />}
        </g>

        {/* Charlie */}
        <g transform={`translate(${CHARLIE.x} ${CHARLIE.y})`}>
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Charlie</text>
          <text y="20" textAnchor="middle" className="topo-role">verifier</text>
          {(targetLink === "charlie" || targetLink === "both") && hasAttack && attack !== "impersonation" && (
            <path d="M -44 0 A 44 44 0 0 1 44 0" fill="none" stroke="var(--qs-fail)" strokeWidth="2" strokeDasharray="4 3" transform="translate(0 12)" />
          )}
          {active(["verify", "analysis"]) && <circle r="40" fill="none" stroke="var(--qs-secondary)" strokeWidth="1.5" />}
        </g>

        {/* Eve — impersonation sits on top of Alice */}
        {hasAttack && attack === "impersonation" ? (
          <g transform={`translate(${ALICE.x} ${ALICE.y})`}>
            <circle r="44" fill="none" stroke="var(--qs-fail)" strokeWidth="2" strokeDasharray="5 3" />
            <text y="-66" textAnchor="middle" className="topo-eve">Eve posing as Alice</text>
            <text y="-46" textAnchor="middle" className="topo-tap">session admission</text>
          </g>
        ) : hasAttack ? (
          <g transform={`translate(${EVE.x} ${EVE.y})`}>
            <circle r={EVE.r} fill="var(--qs-fail-tint)" stroke="var(--qs-fail)" strokeWidth="1.5" />
            <g stroke="var(--qs-fail)" strokeWidth="2.5">
              <path d="M -8 0 L 8 0" />
              <path d="M 0 -8 L 0 8" />
            </g>
            <text x={EVE.r + 8} y={-4} textAnchor="start" className="topo-eve">Eve</text>
            <text x={EVE.r + 8} y={12} textAnchor="start" className="topo-tap">
              {attack === "replay" ? "resends old session" : quantumTap ? "quantum tap" : "classical tap"}
            </text>
          </g>
        ) : null}
      </svg>

      <figcaption className="topology-caption">
        <span className="chip chip-neutral">
          {hasAttack ? (
            <>
              <span className="inline-block size-2 rounded-full bg-fail" />
              attack: {attackLabel(attack)}
              {subtype ? ` · ${tamperingLabel(subtype)}` : ""}
            </>
          ) : (
            <>
              <span className="inline-block size-2 rounded-full bg-pass" />
              no attack
            </>
          )}
        </span>
        <span className="topology-legend">
          solid = quantum state · dashed = classical · <span style={{ color: "var(--qs-fail)" }}>red dashed</span> = tampered
        </span>
      </figcaption>
    </figure>
  );
}
