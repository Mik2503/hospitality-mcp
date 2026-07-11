/**
 * The PMS adapter contract — the seam that makes this project multi-PMS.
 *
 * Every MCP tool talks to hotel data ONLY through this interface, never to a
 * specific PMS directly. Adding a new PMS (Mews, Cloudbeds, ...) means writing
 * one class that implements {@link PMSAdapter} — no tool code changes.
 *
 * Design rules:
 *  - Keep it minimal. Every method here must be implementable by a typical PMS.
 *  - Reads are mandatory ({@link PMSAdapter}); writes are an optional extension
 *    ({@link WritablePMSAdapter}) so read-only PMS — and this project's own
 *    read-only-by-default posture — are first-class, not afterthoughts.
 *  - All inputs and outputs use the normalized domain types. Nothing
 *    provider-specific crosses this boundary.
 *  - When a PMS genuinely cannot support a read method (e.g. no housekeeping
 *    API), throw {@link CapabilityNotSupportedError} rather than inventing data.
 */

import type {
  Availability,
  GuestProfile,
  HousekeepingStatus,
  OccupancyKPIs,
  Property,
  Reservation,
} from "./domain.js";
import type {
  ArrivalsQuery,
  AvailabilityQuery,
  CancelReservationInput,
  CreateReservationInput,
  GuestLookup,
  HousekeepingQuery,
  ModifyReservationInput,
  OccupancyQuery,
  ReservationSearchQuery,
} from "./queries.js";

/**
 * Read-only PMS contract. Every adapter must implement this.
 */
export interface PMSAdapter {
  /** Stable, lowercase provider name, e.g. `"apaleo"`. Used in logs/errors. */
  readonly name: string;

  /** List the properties (hotels) the credentials can access. */
  listProperties(): Promise<Property[]>;

  /** Reservations arriving (checking in) on the query date. */
  getArrivals(query: ArrivalsQuery): Promise<Reservation[]>;

  /** Reservations departing (checking out) on the query date. */
  getDepartures(query: ArrivalsQuery): Promise<Reservation[]>;

  /** Search reservations by guest, date window, and/or status. */
  searchReservations(query: ReservationSearchQuery): Promise<Reservation[]>;

  /** Fetch a single reservation by id. Throws NotFoundError if absent. */
  getReservation(reservationId: string): Promise<Reservation>;

  /** Bookable availability for a property over a date range. */
  getAvailability(query: AvailabilityQuery): Promise<Availability>;

  /** A guest's profile plus their reservation history. */
  getGuest(lookup: GuestLookup): Promise<GuestProfile>;

  /** Aggregate occupancy / ADR / RevPAR for a property over a period. */
  getOccupancyKPIs(query: OccupancyQuery): Promise<OccupancyKPIs>;

  /** Housekeeping state of a property's units. */
  getHousekeeping(query: HousekeepingQuery): Promise<HousekeepingStatus[]>;
}

/**
 * Write-capable PMS contract. Adapters that support mutations implement this in
 * addition to {@link PMSAdapter}. The server only ever calls these when writes
 * are explicitly enabled by the user.
 */
export interface WritablePMSAdapter extends PMSAdapter {
  /** Create a reservation; returns the created, normalized reservation. */
  createReservation(input: CreateReservationInput): Promise<Reservation>;

  /** Modify a reservation; returns the updated reservation. */
  modifyReservation(input: ModifyReservationInput): Promise<Reservation>;

  /** Cancel a reservation; returns the reservation in its canceled state. */
  cancelReservation(input: CancelReservationInput): Promise<Reservation>;
}

/** Type guard: does this adapter support write operations? */
export function isWritable(adapter: PMSAdapter): adapter is WritablePMSAdapter {
  const candidate = adapter as Partial<WritablePMSAdapter>;
  return (
    typeof candidate.createReservation === "function" &&
    typeof candidate.modifyReservation === "function" &&
    typeof candidate.cancelReservation === "function"
  );
}
