"""
Pydantic mirrors of the frontend wire types (src/api/types.ts), REPORT §10.

Responses are camelCase exactly as types.ts (fields are declared in camelCase
directly). Requests are snake_case exactly as spec §4 / client.ts.

Contract additions (REPORT D17/D18): SystemResponse and ResultEnvelope.diagnosis.
`null` means "does not apply" — never 0, never {} (REPORT null rule).
"""
from __future__ import annotations

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

Basis = Literal["Z", "X", "Y"]
AttackTypeId = Literal["no-attack", "forgery", "impersonation", "replay", "tampering"]
TamperingSubtype = Literal["fixed-basis", "random-basis", "partial", "message-substitution", "correction-bit"]
ReplayType = Literal["used", "unknown"]
TargetLink = Literal["bob", "charlie", "both"]
VerifierName = Literal["bob", "charlie"]
StageId = Literal["fidelity", "keys", "distribute", "sign", "verify", "analysis"]
EvActor = Literal["alice", "bob", "charlie", "eve", "system"]
LogLevel = Literal["info", "check", "attack"]
Verdict = Literal["ACCEPTED", "REJECTED"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ requests
class CreateRunRequest(BaseModel):
    """POST /api/runs body — snake_case, optional fields may be omitted (client.ts omits nulls)."""
    model_config = ConfigDict(extra="forbid")
    attack: AttackTypeId
    message: str
    subtype: Optional[TamperingSubtype] = None
    tampered_message: Optional[str] = None
    target_link: Optional[TargetLink] = None
    fixed_basis: Optional[Basis] = None
    intensity_pct: Optional[int] = None
    replay_type: Optional[ReplayType] = None
    seed: Optional[int] = None  # REPORT D14: optional, for tests and reproduction


# ------------------------------------------------------------------ config echo
class RunConfig(Strict):
    attack: AttackTypeId
    subtype: Optional[TamperingSubtype]
    message: str
    tamperedMessage: Optional[str]
    targetLink: Optional[TargetLink]
    fixedBasis: Optional[Basis]
    intensityPct: Optional[int]
    replayType: Optional[ReplayType]


class CreateRunResponse(Strict):
    session_id: str  # snake_case on the wire, as types.ts declares
    seed: int
    config: RunConfig


class RerunResponse(Strict):
    session_id: str
    seed: int


# ------------------------------------------------------------------ events
class SessionEvent(Strict):
    kind: Literal["session"]
    tMs: int
    sessionId: str
    seed: int
    message: str


class FidelityEvent(Strict):
    kind: Literal["fidelity"]
    tMs: int
    F: float
    gate: float
    passed: bool
    referenceFake: bool


class KeysEvent(Strict):
    kind: Literal["keys"]
    tMs: int
    bits: str
    openedBags: list[int]


class CorrectionInfo(Strict):
    sent: str
    received: str
    flipped: bool


class DistributeEvent(Strict):
    kind: Literal["distribute"]
    tMs: int
    set: Literal["a", "b"]
    correction: Optional[CorrectionInfo]


class SignEvent(Strict):
    kind: Literal["sign"]
    tMs: int
    message: str
    digest: str
    bits: str


class InjectEvent(Strict):
    kind: Literal["inject"]
    tMs: int
    attack: str
    subtype: Optional[str]
    target: Optional[TargetLink]
    slotsAttacked: Optional[int]
    slotsTotal: Optional[int]
    tamperedMessage: Optional[str]
    correctionFlipped: Optional[str]


class LedgerEvent(Strict):
    kind: Literal["ledger"]
    tMs: int
    queriedId: str
    found: bool
    status: Optional[Literal["ACTIVE", "USED"]]
    stop: bool


class VerifyBagEvent(Strict):
    kind: Literal["verify-bag"]
    tMs: int
    verifier: VerifierName
    bagIndex: int
    wrong: int
    passLine: int
    fail: bool
    checked: int


class Rates(Strict):
    Z: float
    X: float
    Y: float


class VerifyDoneEvent(Strict):
    kind: Literal["verify-done"]
    tMs: int
    verifier: VerifierName
    passed: int
    failed: int
    verdict: Verdict
    rates: Rates


class AnalysisEvent(Strict):
    kind: Literal["analysis"]
    tMs: int
    step: int
    label: str


class LogEvent(Strict):
    kind: Literal["log"]
    tMs: int
    stage: StageId
    actor: EvActor
    code: str
    level: LogLevel
    message: str
    payload: Optional[Any] = None


class DoneEvent(Strict):
    kind: Literal["done"]
    tMs: int
    sessionId: str


RunEvent = Annotated[
    Union[
        SessionEvent, FidelityEvent, KeysEvent, DistributeEvent, SignEvent,
        InjectEvent, LedgerEvent, VerifyBagEvent, VerifyDoneEvent,
        AnalysisEvent, LogEvent, DoneEvent,
    ],
    Field(discriminator="kind"),
]


class LogRow(Strict):
    timeMs: int
    stage: StageId
    actor: EvActor
    code: str
    level: LogLevel
    message: str
    payload: Optional[Any] = None


# ------------------------------------------------------------------ result
class Severity(Strict):
    score: int
    confidencePart: int
    deviationPart: int
    categoryPart: int


class FidelityTest(Strict):
    F: float
    gate: float
    referenceFake: bool
    passed: bool
    failReason: Optional[str]


class Ledger(Strict):
    queriedId: str
    found: bool
    status: Optional[Literal["ACTIVE", "USED"]]
    reason: str


class WorstBag(Strict):
    index: int
    wrong: int


class VerifierReport(Strict):
    verdict: Literal["ACCEPTED", "REJECTED", "NOT RUN"]
    bagsWrong: Optional[list[int]]
    rates: Optional[Rates]
    passed: int
    failed: int
    worstBag: Optional[WorstBag]


class Verifiers(Strict):
    bob: VerifierReport
    charlie: VerifierReport


class Agreement(Strict):
    consistent: bool
    reason: str


class LibraryEntry(Strict):
    id: str
    label: str
    distance: float
    profile: list[float]


class FingerprintMatch(Strict):
    best: str
    bestLabel: str
    distance: float
    runnerUp: str
    runnerUpLabel: str
    runnerUpDistance: float
    library: list[LibraryEntry]


class WhyStep(Strict):
    label: str
    detail: str
    chart: str


class AttackConfig(Strict):
    attack: str
    subtype: Optional[str]
    targetLink: Optional[TargetLink]
    basis: Optional[str]
    intensityPct: Optional[int]
    slotsAttacked: Optional[int]
    slotsTotal: int
    tamperedMessage: Optional[str]
    correctionMutation: Optional[str]
    replayType: Optional[str]
    injectedBetween: str
    caughtBy: str


class BchDiff(Strict):
    k: int
    changedPositions: list[int]
    changed: list[bool]


class CorrectionBits(Strict):
    sent: str
    received: str
    convention: str


class DetectionCurve(Strict):
    intensities: list[int]
    perBag: list[float]
    signature: list[float]
    chosenIndex: int
    perBagAt: float
    signatureAt: float


class BagDistribution(Strict):
    n: int
    passLine: int
    pHonest: float
    pCheat: float
    falseRejection: float
    falseAcceptance: float


class Diagnosis(Strict):
    """Contract addition D18 — from attack_catalog by the DETECTED key."""
    key: str
    cause: str
    mitigation: list[str]


class ResultEnvelope(Strict):
    severity: Severity
    fidelityTest: Optional[FidelityTest]
    ledger: Optional[Ledger]
    verifiers: Verifiers
    agreement: Optional[Agreement]
    fingerprintMatch: Optional[FingerprintMatch]
    why: list[WhyStep]
    attackConfig: AttackConfig
    bchDiff: Optional[BchDiff]
    correctionBits: Optional[CorrectionBits]
    detectionCurve: Optional[DetectionCurve]
    bagDistribution: Optional[BagDistribution]
    diagnosis: Diagnosis  # contract addition (D18)


class ResultResponse(Strict):
    sessionId: str
    seed: int
    message: str
    verdict: Verdict
    classification: str
    confidence: float
    verdictBanner: ResultEnvelope
    attackPath: dict[str, str]  # {injected, caught}
    story: str
    stoppedAt: Optional[StageId]
    injectedAt: Optional[StageId]


# ------------------------------------------------------------------ analytics
class BinomialResponse(Strict):
    n: int
    pHonest: float
    pCheat: float
    passLine: int
    x: list[int]
    honest: list[float]
    cheater: list[float]
    falseRejection: float
    falseAcceptance: float


class HistoryRow(Strict):
    sessionId: str
    timestamp: str
    attack: str
    subtype: Optional[str]
    targetLink: Optional[TargetLink]
    verdict: Verdict
    severity: int


class ByAttack(Strict):
    attack: str
    runs: int
    detected: int
    meanSeverity: float


class HistoryResponse(Strict):
    runs: list[HistoryRow]
    byAttack: list[ByAttack]


# ------------------------------------------------------------------ system (D17)
class SystemParams(Strict):
    slotsPerBag: int
    bags: int
    passLine: int
    fidelityGate: float
    verifierNames: list[str]
    honestErrorRate: float


class FingerprintPattern(Strict):
    id: str
    label: str
    profile: list[float]
    meaning: str


class SystemResponse(Strict):
    params: SystemParams
    fingerprintLibrary: list[FingerprintPattern]
    engineVersion: str
    catalogVersion: int


class ErrorBody(Strict):
    code: str
    message: str
    detail: Optional[str] = None
