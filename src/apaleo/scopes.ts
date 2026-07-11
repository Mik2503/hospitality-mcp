/**
 * Apaleo OAuth scopes.
 *
 * Scope names verified against the official Apaleo docs:
 *   https://apaleo.dev/guides/api/scopes.html
 *
 * We follow the principle of least privilege: only read scopes are requested by
 * default. Write scopes are added ONLY when the user explicitly enables writes
 * (APALEO_ENABLE_WRITES=true).
 *
 * NOTE: the connected app created in the Apaleo dashboard must be granted these
 * scopes, otherwise the token request will be rejected. The README documents
 * which scopes to grant.
 */

/**
 * Scopes needed for all read-only tools.
 *
 * Deliberately minimal — these three are exactly what the v1 read tools use:
 *  - `setup.read`        properties, unit groups, units, and housekeeping
 *                        condition (unit status)
 *  - `reservations.read` reservations, arrivals, departures, guest lookups,
 *                        and the room revenue used to derive ADR / RevPAR
 *  - `availability.read` availability and the occupancy counts used for KPIs
 *
 * We intentionally do NOT request `folios.read` or `maintenances.read`: the v1
 * tools derive revenue from reservations and housekeeping from unit status, so
 * those scopes would be privilege we never exercise.
 */
export const READ_SCOPES = [
  "setup.read",
  "reservations.read",
  "availability.read",
] as const;

/** Additional scopes needed only when writes are enabled. */
export const WRITE_SCOPES = [
  "reservations.manage", // create, modify, cancel reservations
] as const;

/**
 * Build the list of scopes to request for the current configuration.
 * Least privilege: writes are excluded unless explicitly enabled.
 */
export function scopesForConfig(enableWrites: boolean): string[] {
  return enableWrites
    ? [...READ_SCOPES, ...WRITE_SCOPES]
    : [...READ_SCOPES];
}
