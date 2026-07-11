/**
 * Query and input types for the {@link PMSAdapter} contract.
 *
 * Like the domain model, these are PMS-neutral. Adapters translate them into
 * whatever their provider's API expects.
 */

import type { IsoDate, Money, ReservationStatus } from "./domain.js";

/** Which date a reservation search window applies to. */
export type ReservationDateType = "arrival" | "departure" | "stay";

/** A closed date range. */
export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Look up arrivals or departures for a property on a given day. */
export interface ArrivalsQuery {
  propertyId: string;
  /** The day to look at. */
  date: IsoDate;
}

/** Filters for searching reservations. All filters are optional and AND-ed. */
export interface ReservationSearchQuery {
  propertyId?: string;
  /** Free-text guest name to match (first, last, or full). */
  guestName?: string;
  /** Restrict to these statuses. */
  status?: ReservationStatus[];
  /** Date window plus which date it applies to. */
  dateRange?: DateRange & { type: ReservationDateType };
  /** Maximum number of results to return. */
  limit?: number;
}

/**
 * Look up a guest. Providers differ: some support a stable guest id, others
 * only allow lookup by email or name. Provide whichever the caller has; the
 * adapter uses what its PMS supports.
 */
export interface GuestLookup {
  guestId?: string;
  email?: string;
  name?: string;
  /** Optionally narrow the search to one property. */
  propertyId?: string;
}

/** Query bookable availability for a property. */
export interface AvailabilityQuery {
  propertyId: string;
  from: IsoDate;
  to: IsoDate;
  /** Restrict to a single unit group (room type). */
  unitGroupId?: string;
  /** Occupancy to check availability for. */
  adults?: number;
}

/** Query aggregate KPIs for a property over a period. */
export interface OccupancyQuery {
  propertyId: string;
  from: IsoDate;
  to: IsoDate;
}

/** Query housekeeping state for a property. */
export interface HousekeepingQuery {
  propertyId: string;
  /** Restrict to a single unit group (room type). */
  unitGroupId?: string;
}

// ---------------------------------------------------------------------------
// Write inputs (contract defined now; implemented in a later phase)
// ---------------------------------------------------------------------------

/** Minimal guest details needed to create a reservation. */
export interface GuestInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

/** Input for creating a reservation. */
export interface CreateReservationInput {
  propertyId: string;
  arrival: IsoDate;
  departure: IsoDate;
  unitGroupId: string;
  ratePlanId?: string;
  adults: number;
  children?: number;
  guest: GuestInput;
  notes?: string;
  /** Optional price override; otherwise the PMS/rate plan decides. */
  totalAmount?: Money;
}

/** Input for modifying an existing reservation. Only provided fields change. */
export interface ModifyReservationInput {
  reservationId: string;
  arrival?: IsoDate;
  departure?: IsoDate;
  adults?: number;
  children?: number;
  notes?: string;
}

/** Input for canceling a reservation. */
export interface CancelReservationInput {
  reservationId: string;
  reason?: string;
}
