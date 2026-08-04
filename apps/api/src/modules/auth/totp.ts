import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  generateSecret as otpGenerateSecret,
  generateURI,
  verifySync,
} from "otplib";
import { env } from "../../config/env.js";

/**
 * TOTP secret handling (docs/10-security-compliance.md §1).
 *
 * `users.totp_secret_enc` is bytea because the secret is stored
 * **encrypted**, not merely encoded: a TOTP secret is a bearer credential,
 * so a database leak alone must not be enough to mint valid codes. Sessions
 * and reset tokens are hashed instead — those we only ever need to compare,
 * whereas a TOTP secret has to be recovered to verify a code.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// A dev-only ephemeral key. Production refuses to boot without a real one
// (see config/env.ts) precisely because losing it locks out every 2FA user.
const key = env.TOTP_ENCRYPTION_KEY
  ? Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64")
  : randomBytes(32);

if (key.length !== 32) {
  throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
}

// Layout: [12-byte IV][16-byte auth tag][ciphertext]
export function encryptSecret(secret: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptSecret(blob: Buffer): string {
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function generateSecret(): string {
  return otpGenerateSecret();
}

/** The `otpauth://` URI an authenticator app scans. */
export function otpauthUri(email: string, secret: string): string {
  return generateURI({
    strategy: "totp",
    issuer: "Trellis",
    label: email,
    secret,
  });
}

/**
 * Verifies a 6-digit code, accepting the adjacent 30s step on either side.
 * That absorbs ordinary phone/server clock drift without meaningfully
 * widening the guess space — and the challenge is attempt-capped anyway
 * (see two-factor.ts).
 */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return verifySync({
      strategy: "totp",
      token: token.replace(/\s/g, ""),
      secret,
      epochTolerance: 1,
    }).valid;
  } catch {
    return false;
  }
}
