import * as argon2 from "argon2";

/**
 * docs/03-backend-architecture.md §3: "argon2id (m=64 MiB, t=3, p=4);
 * breach check against Pwned-passwords k-anonymity at signup/change."
 *
 * The breach check against the Pwned Passwords API is deliberately not
 * implemented here — it's an external network call this pass doesn't
 * wire up (no outbound-call infra/mocking exists yet). Flagged, not
 * silently dropped: add it before this goes anywhere near production.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB, in KiB
  timeCost: 3,
  parallelism: 4,
} satisfies argon2.Options;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // argon2.verify throws on a malformed hash rather than returning
    // false — treat that identically to "wrong password".
    return false;
  }
}
