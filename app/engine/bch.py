"""BCH(63,39) over GF(2^6), primitive polynomial x^6 + x + 1 (REPORT §2.1).

Designed distance 9 (t = 4): generator = lcm of the minimal polynomials of
alpha^1..alpha^8, degree 24. Systematic encoding; any two distinct codewords
differ in >= 9 of the 63 positions — the property message substitution relies on.

Message pipeline: SHA-256(message utf-8) -> first 39 bits (MSB-first) -> encode.
"""
from __future__ import annotations

import hashlib

import numpy as np

N, K, PARITY = 63, 39, 24
_PRIM = 0b1000011  # x^6 + x + 1

# ---- GF(64) tables -----------------------------------------------------------
_EXP = [0] * 126
_LOG = [0] * 64
_x = 1
for _i in range(63):
    _EXP[_i] = _EXP[_i + 63] = _x
    _LOG[_x] = _i
    _x <<= 1
    if _x & 0b1000000:
        _x ^= _PRIM


def _gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _EXP[_LOG[a] + _LOG[b]]


def _minimal_poly(power: int) -> int:
    """Minimal polynomial (over GF(2), as an int bitmask, bit i = coeff of x^i)
    of alpha^power — product of (x - alpha^j) over the cyclotomic coset."""
    coset, j = [], power % 63
    while j not in coset:
        coset.append(j)
        j = (j * 2) % 63
    poly = [1]  # coefficients in GF(64), ascending degree
    for j in coset:
        root = _EXP[j]
        nxt = [0] * (len(poly) + 1)
        for d, c in enumerate(poly):
            nxt[d + 1] ^= c            # x * c x^d
            nxt[d] ^= _gf_mul(c, root)  # root * c x^d  (== -root in char 2)
        poly = nxt
    mask = 0
    for d, c in enumerate(poly):
        assert c in (0, 1), "minimal polynomial must land in GF(2)"
        mask |= c << d
    return mask


def _poly_mul(a: int, b: int) -> int:
    out = 0
    while b:
        if b & 1:
            out ^= a
        a <<= 1
        b >>= 1
    return out


def _poly_mod(a: int, m: int) -> int:
    dm = m.bit_length() - 1
    while a.bit_length() - 1 >= dm and a:
        a ^= m << (a.bit_length() - 1 - dm)
    return a


GENERATOR = 1
for _p in (1, 3, 5, 7):
    GENERATOR = _poly_mul(GENERATOR, _minimal_poly(_p))
assert GENERATOR.bit_length() - 1 == PARITY, GENERATOR.bit_length()


# ---- public API ---------------------------------------------------------------
def encode(word: np.ndarray) -> np.ndarray:
    """39 message bits -> 63 codeword bits (systematic: message on x^24..x^62)."""
    assert word.shape == (K,)
    m = 0
    for i, bit in enumerate(word):
        if bit:
            m |= 1 << i
    shifted = m << PARITY
    code = shifted | _poly_mod(shifted, GENERATOR)
    return np.array([(code >> j) & 1 for j in range(N)], dtype=np.int8)


def is_codeword(bits: np.ndarray) -> bool:
    """True iff the 63-bit vector is a codeword (syndrome 0). The difference of
    two codewords is a codeword — the message-substitution failed-set test."""
    v = 0
    for j, bit in enumerate(bits):
        if bit:
            v |= 1 << j
    return _poly_mod(v, GENERATOR) == 0


def message_word(message: str) -> np.ndarray:
    """SHA-256(message) -> first 39 bits, MSB-first."""
    digest = hashlib.sha256(message.encode("utf-8")).digest()
    bits = np.unpackbits(np.frombuffer(digest, dtype=np.uint8))
    return bits[:K].astype(np.int8)


def codeword_for(message: str) -> np.ndarray:
    return encode(message_word(message))


def digest8(message: str) -> str:
    return hashlib.sha256(message.encode("utf-8")).hexdigest()[:8]
