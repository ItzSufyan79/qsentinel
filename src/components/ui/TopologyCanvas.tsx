/**
 * Network topology canvas — report section 6.2. Pure SVG driven by the live
 * stage AND the current event frame, so each stage shows exactly what moves
 * on which channel:
 *   · fidelity   — probe pairs await Alice's entanglement test
 *   · keys       — Alice prepares one 0/1 bag-pair per encoded position
 *   · distribute — quantum states téléport to the current set's verifier,
 *                  correction bits follow the classical channel
 *   · sign       — only classical: the signature travels, states already sit
 *                  with the verifiers (so the quantum links go quiet)
 *   · verify     — the active verifier measures bag-by-bag
 * Eve is always visible while an attack is configured, and the tapped edge is
 * marked in red. No numbers here; the numbers live in the stage panels.
 */

import type {
  AttackTypeId,
  DistributeEvent,
  InjectEvent,
  LedgerEvent,
  RunEvent,
  SignEvent,
  StageId,
  TamperingSubtype,
  TargetLink,
  VerifyBagEvent,
  VerifierName,
} from "../../api/types";
import { attackLabel, tamperingLabel } from "../../api/types";

interface Props {
  stage: StageId | null;
  attack: AttackTypeId;
  subtype: TamperingSubtype | null;
  targetLink: TargetLink;
  /** the frame currently under the playhead; drives the stage choreography */
  event?: RunEvent | undefined;
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

/** a single travelling packet on one channel */
function Packet({
  edge,
  color,
  dur,
  delay = "0s",
  r = 3.5,
}: {
  edge: EdgeDef;
  color: string;
  dur: string;
  delay?: string;
  r?: number;
}) {
  return (
    <circle r={r} fill={color}>
      <animateMotion dur={dur} begin={delay} repeatCount="indefinite">
        <mpath href={`#qs-edge-${edge.id}`} />
      </animateMotion>
    </circle>
  );
}

/** small mono callout next to a node (learned from the frames, no invented numbers) */
function Callout({
  x,
  y,
  text,
  tone = "var(--qs-n-500)",
  reverse = false,
}: {
  x: number;
  y: number;
  text: string;
  tone?: string;
  reverse?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={reverse ? "end" : "start"}
      className="topo-tap"
      style={{ fill: tone }}
    >
      {text}
    </text>
  );
}

/** animated ring — measurement / admission / set delivery */
function PulseRing({ x, y, color, label }: { x: number; y: number; color: string; label?: string }) {
  return (
    <g>
      <circle r="40" fill="none" stroke={color} strokeWidth="1.5">
        <animate attributeName="r" values="40;52;40" dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.35;0.9" dur="1.4s" repeatCount="indefinite" />
      </circle>
      {label && (
        <text x={x} y={y} textAnchor="middle" className="topo-tap" style={{ fill: color }}>
          {label}
        </text>
      )}
    </g>
  );
}

export function TopologyCanvas({ stage, attack, subtype, targetLink, event }: Props) {
  const hasAttack = attack !== "no-attack";

  /** Which channel type Eve tapped this attack type. */
  const quantumTap = subtype === "fixed-basis" || subtype === "random-basis" || subtype === "partial";
  const classicalTap =
    attack === "forgery" || subtype === "message-substitution" || subtype === "correction-bit";

  /** What physically moves, per stage — learned from the event frames. */
  const distribute = stage === "distribute";
  const signing = stage === "sign";
  const verifying = stage === "verify";
  const fidelity = stage === "fidelity";
  const keying = stage === "keys";
  const analysis = stage === "analysis";

  /** recipient of the current distribute frame, when known */
  const distTo = (event?.kind === "distribute"
    ? (event as DistributeEvent).set === "a"
      ? "bob"
      : "charlie"
    : null) as "bob" | "charlie" | null;

  /* quantum states only ever move during distribute (teleportation) — and
     only on the channel toward the current set's verifier. */
  const quantumPacket = (e: EdgeDef) =>
    e.kind === "quantum" && distribute && (distTo === null || e.to === distTo);

  /* correction bits ride the classical channel during distribute (same
     recipient); the signature follows it to both verifiers during sign. */
  const classicalPacket = (e: EdgeDef) =>
    e.kind === "classical" && (signing || (distribute && (distTo === null || e.to === distTo)));

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

  /* ---- current-frame facts the diagram turns into movement ---- */
  const measuring: VerifierName | null =
    verifying && event?.kind === "verify-bag"
      ? (event as VerifyBagEvent).verifier
      : null;

  const signingMessage = signing && event?.kind === "sign" ? (event as SignEvent).message : null;

  const injected = event?.kind === "inject" ? (event as InjectEvent) : null;

  const ledger = event?.kind === "ledger" ? (event as LedgerEvent) : null;

  const node = (who: "bob" | "charlie") => (who === "bob" ? BOB : CHARLIE);

  return (
    <figure className="topology" aria-label="Device topology">
      <svg viewBox="0 0 620 360" className="w-full" role="img" aria-hidden="true">
        {/* channels: solid = quantum state, dashed = classical */}
        {EDGES.map((e) => {
          const red = isTapped(e);
          const on = active(
            e.kind === "quantum"
              ? ["distribute", "verify", "fidelity"]
              : ["distribute", "sign", "verify"],
          );
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
              {/* the physical payload this stage actually moves */}
              {(quantumPacket(e) || classicalPacket(e)) && (
                <Packet
                  edge={e}
                  color={e.kind === "quantum" ? "var(--qs-primary)" : "var(--qs-n-600)"}
                  dur={e.kind === "quantum" ? "1.4s" : "1.8s"}
                  r={e.kind === "quantum" ? 3.5 : 2.6}
                  delay={e.kind === "quantum" && e.to === "bob" ? "-0.7s" : "0s"}
                />
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

        {/* ---- stage callouts, learned from the live frames ---- */}
        {fidelity && (
          <Callout x={ALICE.x + 42} y={ALICE.y + 12} text="probe pairs ready" />
        )}

        {keying && <Callout x={ALICE.x + 42} y={ALICE.y + 12} text="prepares 0/1 bag-pairs" />}

        {distribute &&
          (distTo ? (
            <PulseRing
              x={node(distTo).x}
              y={node(distTo).y + 54}
              color="var(--qs-secondary)"
              label={`receives set ${((event as DistributeEvent).set).toUpperCase()}`}
            />
          ) : (
            <Callout x={ALICE.x + 42} y={ALICE.y + 12} text="teleports states" />
          ))}

        {signing && (
          <Callout
            x={BOB.x - 40}
            y={BOB.y + 8}
            reverse
            tone="var(--qs-secondary)"
            text={signingMessage ? `signs "${signingMessage}"` : "signs message"}
          />
        )}

        {verifying &&
          (measuring ? (
            <PulseRing
              x={node(measuring).x}
              y={node(measuring).y + 54}
              color="var(--qs-secondary)"
              label={`measuring bag ${String((event as VerifyBagEvent).bagIndex).padStart(2, "0")}`}
            />
          ) : (
            <Callout x={ALICE.x + 42} y={ALICE.y + 12} text="verifiers measure" />
          ))}

        {ledger && (
          <Callout
            x={ALICE.x + 42}
            y={ALICE.y + 34}
            tone={ledger.found ? "var(--qs-primary)" : "var(--qs-fail)"}
            text={`ledger ${ledger.found ? "ok" : "reject"}`}
          />
        )}

        {verifying && event?.kind === "verify-done" && (
          <Callout x={ALICE.x + 42} y={ALICE.y + 12} text="full measurement" />
        )}

        {analysis && <Callout x={ALICE.x + 42} y={ALICE.y + 12} text="examining evidence" />}

        {/* Alice */}
        <g transform={`translate(${ALICE.x} ${ALICE.y})`}>
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Alice</text>
          <text y="20" textAnchor="middle" className="topo-role">sender</text>
          {active(["fidelity", "distribute", "sign"]) && (
            <circle r="40" fill="none" stroke="var(--qs-primary)" strokeWidth="1.5" strokeDasharray="4 3" />
          )}
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

        {/* what Eve actually put on the line — from the inject frame */}
        {injected && (
          <g>
            {quantumTap && (
              <text x={EVE.x + EVE.r + 8} y={30} className="topo-tap" style={{ fill: "var(--qs-fail)" }}>
                {injected.slotsAttacked != null
                  ? "overwrites slots"
                  : injected.subtype === "fixed-basis"
                    ? "fixed-basis"
                    : "random-basis"}
              </text>
            )}
            {classicalTap && (
              <text x={EVE.x + EVE.r + 8} y={30} className="topo-tap" style={{ fill: "var(--qs-fail)" }}>
                {injected.tamperedMessage != null
                  ? `replaces with "${injected.tamperedMessage}"`
                  : injected.correctionFlipped != null
                    ? "flips correction bit"
                    : "forges signature"}
              </text>
            )}
          </g>
        )}

        {/* replay: the ledger is queried with a foreign id — only replay presents
            a session id that is not this run's own */}
        {ledger && attack === "replay" && (
          <text
            x={EVE.x + EVE.r + 8}
            y={30}
            className="topo-tap"
            style={{ fill: "var(--qs-fail)" }}
          >
            requests {ledger.queriedId.slice(0, 10)}…
          </text>
        )}
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