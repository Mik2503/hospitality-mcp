/**
 * Small date helpers used by the Apaleo adapter.
 *
 * Apaleo returns timestamps with a property-local offset, e.g.
 * `2026-07-12T10:00:00+02:00`. For our normalized model we care about the
 * local CALENDAR date (the check-in day as the hotel sees it), which is exactly
 * the first 10 characters of that string.
 */

/** Extract the local calendar date (`YYYY-MM-DD`) from an ISO date/time string. */
export function localDate(isoDateTime: string | undefined): string {
  return (isoDateTime ?? "").slice(0, 10);
}

/** Add `days` (may be negative) to a `YYYY-MM-DD` date, returning `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole-day difference `later − earlier` between two `YYYY-MM-DD` dates. */
export function diffDays(later: string, earlier: string): number {
  const ms = Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Round a monetary amount to 2 decimals. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
