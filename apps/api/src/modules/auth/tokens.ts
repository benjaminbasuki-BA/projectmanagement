import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared handling for the opaque, single-use tokens auth issues: password
 * reset links, 2FA challenges, and recovery codes.
 *
 * Same discipline as `sessions.ts` — the raw value leaves the server once
 * and only its SHA-256 is stored, so a database leak yields nothing usable.
 * (TOTP secrets are the exception and are encrypted rather than hashed,
 * because verification needs the original back; see totp.ts.)
 */

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** Constant-time compare for values already reduced to fixed-length hashes. */
export function hashesEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Recovery codes are shown once at enrollment. Grouped as `xxxx-xxxx` for
 * legibility when someone writes them down — Crockford-ish alphabet with
 * the characters people misread (0/O, 1/I/L) left out.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode(): string {
  const pick = () => {
    const buf = randomBytes(4);
    let out = "";
    for (const byte of buf) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    return out;
  };
  return `${pick()}-${pick()}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s/g, "");
}
