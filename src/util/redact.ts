/**
 * Redaction helpers.
 *
 * Golden rule: secrets and tokens must NEVER appear in logs or error messages.
 * The primary defense is simply not passing them around — these helpers are the
 * second line of defense for the places where a value might slip through.
 */

const MASK = "****";

/**
 * Fully mask a secret (client secret, password, Basic auth header, ...).
 * Always returns a constant mask so nothing about the value leaks — not even
 * its length.
 */
export function redactSecret(value: unknown): string {
  return value === undefined || value === null || value === "" ? "" : MASK;
}

/**
 * Mask a bearer/access token for diagnostics. Reveals only that a token exists
 * and its length (never any characters of the token itself), which is enough to
 * debug "is a token present?" without exposing anything usable.
 */
export function redactToken(token: unknown): string {
  if (typeof token !== "string" || token.length === 0) return MASK;
  return `${MASK}(len=${token.length})`;
}
