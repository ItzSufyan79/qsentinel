"""
QSentinel engine constants — every fixed value from REPORT §2.1.

RULE (report §0.1): the numbers 0.5 / 0.34 / 1/3 / 0.98 never appear in the
engine as generators of outcomes. Here they appear only as the fingerprint
LIBRARY (reference patterns for detection) and as system parameters. Nothing
in protocol.py / attacks.py draws an outcome from any of these.
"""
from __future__ import annotations

ENGINE_VERSION = "1.0.0"

# ---- QDS geometry -----------------------------------------------------------
SLOTS_PER_BAG = 128
BAGS = 63                      # BCH(63,39) encoded positions
BAGS_PER_POSITION = 2          # 0-bag and 1-bag; only the opened one is measured
BCH_K = 39                     # message word bits (first 39 bits of SHA-256)
BCH_DESIGNED_DISTANCE = 9      # d >= 9, t = 4, GF(2^6) with x^6 + x + 1

# ---- decision rules ---------------------------------------------------------
PASS_LINE = 12                 # a bag fails at >= 12 wrong of 128
FIDELITY_GATE = 0.5
FIDELITY_SIGMA_FACTOR = 4      # pass rule: F - 4*sigma_F > gate, per link
HONEST_ERROR_RATE = 0.02       # emerges from LINK_NOISE_Q; used by detection/binomial only
LINK_NOISE_Q = 0.04            # depolarising: random Pauli I/X/Y/Z uniform with prob q
FIDELITY_PAIRS_PER_BASIS = 300 # per basis per link (900 pairs per link)
BINOMIAL_TAIL = 4e-5           # pass-line derivation tail bound

VERIFIER_NAMES = ("Bob", "Charlie")
VERIFIERS = ("bob", "charlie")

# severity weights (confidence, deviation, category)
SEVERITY_W_CONFIDENCE = 0.4
SEVERITY_W_DEVIATION = 0.3
SEVERITY_W_CATEGORY = 0.3

# ---- fingerprint library (REPORT §7.2) — detection reference patterns only ---
FINGERPRINT_LIBRARY = (
    {"id": "honest",     "label": "Honest / normal noise",          "profile": (0.02, 0.02, 0.02), "meaning": "normal noise"},
    {"id": "guess",      "label": "Blind guessing (forgery)",       "profile": (0.5, 0.5, 0.5),    "meaning": "blind guessing (forgery-type, no information)"},
    {"id": "random",     "label": "Random-basis intercept-resend",  "profile": (1 / 3, 1 / 3, 1 / 3), "meaning": "random-basis intercept-resend"},
    {"id": "fixed",      "label": "Fixed-basis intercept-resend",   "profile": (0.5, 0.5, 0.0),    "meaning": "fixed-basis intercept-resend"},
    {"id": "correction", "label": "Correction-bit tampering",       "profile": (1.0, 1.0, 0.0),    "meaning": "correction-bit tampering (two bases high, one near 0)"},
)

# random-basis reference rate used by detection/curve: e + (1 - 2e)/3
P_RAND = HONEST_ERROR_RATE + (1 - 2 * HONEST_ERROR_RATE) / 3

# ---- randomness (REPORT §4) ---------------------------------------------------
STREAM_NAMES = (
    "alice-keys-a", "alice-keys-b",
    "bell-a", "bell-b",
    "noise-a", "noise-b",
    "alice-bell-measure-a", "alice-bell-measure-b",
    "verify-a", "verify-b",
    "fidelity-a", "fidelity-b",
    "eve", "eve-select", "session-fixture",
)
SESSION_ALPHABET = "0123456789abcdefghjkmnpqrstuvwxyz"  # same 33 chars as frontend + kit
SESSION_KEY_LENGTH = 8
SEED_MAX = 2 ** 53  # JS-safe

# ---- stable log codes (REPORT §10.4) -----------------------------------------
LOG_CODES = (
    "SESSION_CREATED", "FIDELITY_TEST_PASSED", "FIDELITY_TEST_FAILED",
    "IMPERSONATION_STOPPED", "KEYS_GENERATED", "TELEPORT_DONE", "ATTACK_INJECTED",
    "SIGNATURE_CREATED", "LEDGER_LOOKUP_ACTIVE", "LEDGER_LOOKUP_USED",
    "LEDGER_LOOKUP_NOT_FOUND", "BOB_VERIFY_START", "BOB_VERIFY_PASSED",
    "BOB_VERIFY_FAILED", "CHARLIE_VERIFY_START", "CHARLIE_VERIFY_PASSED",
    "CHARLIE_VERIFY_FAILED", "FINGERPRINT_MATCHED", "CLASSIFIED",
    "ROOT_CAUSE_SET", "SEVERITY_COMPUTED", "KEYS_DESTROYED",
)

SYSTEM_PARAMS = {
    "slotsPerBag": SLOTS_PER_BAG,
    "bags": BAGS,
    "passLine": PASS_LINE,
    "fidelityGate": FIDELITY_GATE,
    "verifierNames": list(VERIFIER_NAMES),
    "honestErrorRate": HONEST_ERROR_RATE,
}
