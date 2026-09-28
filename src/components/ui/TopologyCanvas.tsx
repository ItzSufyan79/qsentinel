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

/** Edge geometry (Alice is centre-left). */
const EDGES = {
  bobQuantum: "M 190 150 C 250 40, 320 40, 380 86",
  charlieQuantum: "M 190 158 C 250 268, 320 268, 380 222",
  bobClassical: "M 214 172 C 270 235, 300 250, 360 296",
  charlieClassical: "M 214 140 C 275 84, 305 70, 360 26",
} as const;

export function TopologyCanvas({ stage, attack, subtype, targetLink }: Props) {
  const hasAttack = attack !== "no-attack";

  /** Which edge Eve tapped this attack type. */
  const hourglass = subtype === "fixed-basis" || subtype === "random-basis" || subtype === "partial";
  const quantumTap = hourglass;
  const classicalTap =
    attack === "forgery" ||
    subtype === "message-substitution" ||
    subtype === "correction-bit";

  const animateQuantum =
    stage === "distribute" || stage === "verify" || stage === "sign";

  const active = (on: StageId | StageId[]) =>
    (Array.isArray(on) ? on : [on]).includes(stage as StageId);

  const edge = (
    d: string,
    opts: {
      klass?: string;
      animate?: boolean;
      label?: string;
      attacked?: boolean;
    },
  ) => {
    const pathId = `edge-${d.length}-${opts.label ?? ""}-${opts.attacked ?? ""}`.replace(/[^a-z0-9]/gi, "-");
    return (
      <g>
        <path
          id={pathId}
          d={d}
          fill="none"
          stroke="var(--qs-n-500)"
          strokeWidth={opts.attacked ? 2.5 : 1.25}
          strokeDasharray={opts.attacked ? "6 4" : "5 4"}
          className={opts.klass ?? ""}
        />
        {opts.animate && (
          <circle r="3.5" fill="var(--qs-primary)">
            <animateMotion dur="1.1s" repeatCount="indefinite">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        )}
        {opts.label && (
          <text className="topo-label" dy="-5">
            <textPath href={`#${pathId}`} startOffset="50%">
              {opts.label}
            </textPath>
          </text>
        )}
      </g>
    );
  };

  return (
    <figure className="topology" aria-label="Device topology">
      <svg viewBox="0 0 620 360" className="w-full" role="img" aria-hidden="true">
        {/* safe quantum channel */}
        {edge(EDGES.bobQuantum, {
          klass: active(["distribute", "sign", "verify"]) ? "edge-on" : "",
          animate: animateQuantum && targetLink !== "charlie",
          label: "quantum",
        })}
        {edge(EDGES.charlieQuantum, {
          klass: active(["distribute", "sign", "verify"]) ? "edge-on" : "",
          animate: animateQuantum && targetLink !== "bob",
          label: "quantum",
        })}
        {/* classical / classical ancillary */}
        {edge(EDGES.bobClassical, { label: "classical" })}
        {edge(EDGES.charlieClassical, { label: "classical" })}

        {/* attacked tap, only when the run has an attacker */}
        {hasAttack && quantumTap && (
          <g stroke="var(--qs-fail)" strokeWidth="2.5" strokeDasharray="6 4">
            <path d="M 300 200 L 372 152" fill="none" />
            <path d="M 300 200 L 372 260" fill="none" />
            <circle cx="300" cy="200" r="4" fill="var(--qs-fail)" />
          </g>
        )}
        {hasAttack && classicalTap && (
          <g stroke="var(--qs-fail)" strokeWidth="2.5" strokeDasharray="6 4">
            <path d="M 300 235 L 356 308" fill="none" />
            <circle cx="300" cy="235" r="4" fill="var(--qs-fail)" />
          </g>
        )}

        {/* Alice */}
        <g transform="translate(120 155)">
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Alice</text>
          <text y="20" textAnchor="middle" className="topo-role">sender</text>
          {active("fidelity") && <circle r="40" fill="none" stroke="var(--qs-primary)" strokeWidth="1.5" strokeDasharray="4 3" />}
        </g>

        {/* Bob */}
        <g transform="translate(462 76)">
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Bob</text>
          <text y="20" textAnchor="middle" className="topo-role">verifier</text>
          {(targetLink === "bob" || targetLink === "both") && hasAttack && (
            <path d="M -44 0 A 44 44 0 0 1 44 0" fill="none" stroke="var(--qs-fail)" strokeWidth="2" strokeDasharray="4 3" transform="translate(0 12)" />
          )}
          {active(["verify", "analysis"]) && <circle r="40" fill="none" stroke="var(--qs-secondary)" strokeWidth="1.5" />}
        </g>

        {/* Charlie */}
        <g transform="translate(462 292)">
          <circle r="34" fill="var(--qs-n-100)" stroke="var(--qs-n-400)" strokeWidth="1.5" />
          <text y="4" textAnchor="middle" className="topo-name">Charlie</text>
          <text y="20" textAnchor="middle" className="topo-role">verifier</text>
          {(targetLink === "charlie" || targetLink === "both") && hasAttack && (
            <path d="M -44 0 A 44 44 0 0 1 44 0" fill="none" stroke="var(--qs-fail)" strokeWidth="2" strokeDasharray="4 3" transform="translate(0 12)" />
          )}
          {active(["verify", "analysis"]) && <circle r="40" fill="none" stroke="var(--qs-secondary)" strokeWidth="1.5" />}
        </g>

        {/* Eve — impersonation sits on top of Alice */}
        {hasAttack && attack === "impersonation" ? (
          <g transform="translate(120 155)">
            <circle r="44" fill="none" stroke="var(--qs-fail)" strokeWidth="2" strokeDasharray="5 3" />
            <text y="-52" textAnchor="middle" className="topo-eve">Eve posing as Alice</text>
            <text y="-38" textAnchor="middle" className="topo-tap">session admission</text>
          </g>
        ) : hasAttack ? (
          <g transform="translate(290 208)">
            <circle r="22" fill="var(--qs-fail-tint)" stroke="var(--qs-fail)" strokeWidth="1.5" />
            <g stroke="var(--qs-fail)" strokeWidth="2.5">
              <path d="M -8 0 L 8 0" />
              <path d="M 0 -8 L 0 8" />
            </g>
            <text y="-30" textAnchor="middle" className="topo-eve">Eve</text>
            <text y="-16" textAnchor="middle" className="topo-tap">
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