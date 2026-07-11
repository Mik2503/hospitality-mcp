/**
 * Normalized hospitality domain model.
 *
 * These types are the PMS-NEUTRAL vocabulary of the project. They must describe
 * hotel concepts in a way that is equally valid for Apaleo, Mews, Cloudbeds, or
 * any other PMS. No provider-specific field, id shape, status string, or quirk
 * may leak into this file — that is the whole point of the normalized core.
 *
 * Rule of thumb for contributors: if a field only makes sense for one PMS, it
 * does NOT belong here. Map it away inside that PMS's adapter instead.
 */

// ---------------------------------------------------------------------------
// Value objects
// ---------------------------------------------------------------------------

/** A calendar date with no time component, ISO 8601: `YYYY-MM-DD`. */
export type IsoDate = string;

/** A timestamp, ISO 8601: `YYYY-MM-DDTHH:mm:ssZ`. */
export type IsoDateTime = string;

/** A monetary amount in a specific currency. */
export interface Money {
  /** Numeric amount, e.g. `129.5`. */
  amount: number;
  /** ISO 4217 currency code, e.g. `"EUR"`. */
  currency: string;
}

/** A postal address. All parts optional; PMS coverage varies. */
export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  postalCode?: string;
  /** State / province / region. */
  region?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. `"DE"`. */
  countryCode?: string;
}

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a reservation, normalized across PMS platforms.
 * Not every PMS produces every value; adapters map their own states onto the
 * closest member here.
 */
export const RESERVATION_STATUSES = [
  "pending", // created but not yet confirmed
  "confirmed", // confirmed, guest not yet arrived
  "in_house", // guest checked in / currently staying
  "checked_out", // stay completed
  "canceled", // reservation canceled
  "no_show", // guest never arrived
  "unknown", // provider reported a status we don't recognize (never assume active)
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * Housekeeping condition of a unit (room), normalized. Adapters map their
 * provider's cleaning states onto these.
 */
export const HOUSEKEEPING_CONDITIONS = [
  "clean",
  "dirty",
  "cleaning_in_progress",
  "inspected",
  "unknown",
] as const;

export type HousekeepingCondition = (typeof HOUSEKEEPING_CONDITIONS)[number];

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** A hotel / property. */
export interface Property {
  id: string;
  name: string;
  /** Default currency for the property (ISO 4217). */
  currencyCode?: string;
  /** IANA time zone, e.g. `"Europe/Berlin"`. */
  timeZone?: string;
  address?: Address;
}

/**
 * A category of interchangeable units — a "room type" (e.g. "Double Standard").
 * Called a unit group here to stay neutral across PMS naming.
 */
export interface UnitGroup {
  id: string;
  name: string;
  /** Short code, if the PMS exposes one. */
  code?: string;
  description?: string;
  /** Maximum occupancy of a unit in this group. */
  maxPersons?: number;
  /** Number of physical units in the group, if known. */
  unitCount?: number;
}

/** A physical, bookable unit — a specific room. */
export interface Unit {
  id: string;
  /** Human-facing identifier, typically the room number/name. */
  name: string;
  unitGroupId?: string;
  unitGroupName?: string;
  maxPersons?: number;
}

/**
 * A person associated with a reservation. Any subset of fields may be present
 * depending on what the PMS exposes and on data-privacy settings.
 *
 * `id` is optional on purpose: some PMS have a global guest profile with a
 * stable id, others only carry guest details inline on each reservation.
 */
export interface Guest {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  /** ISO 3166-1 alpha-2 nationality country code, e.g. `"ES"`. */
  nationalityCountryCode?: string;
  address?: Address;
}

/** A reservation / booking of one unit for a stay. */
export interface Reservation {
  id: string;
  propertyId: string;
  status: ReservationStatus;
  primaryGuest: Guest;
  /** Check-in date. */
  arrival: IsoDate;
  /** Check-out date. */
  departure: IsoDate;
  /** Number of nights (departure − arrival). */
  nights: number;
  adults: number;
  children: number;
  unitGroupId?: string;
  unitGroupName?: string;
  /** Assigned physical unit, if one has been allocated. */
  unitId?: string;
  unitName?: string;
  ratePlanId?: string;
  /** Booking source / channel as a neutral label, e.g. `"Direct"`, `"Booking.com"`. */
  channel?: string;
  /** Total gross price of the stay. */
  totalAmount?: Money;
  /** Outstanding balance still owed. */
  balance?: Money;
  notes?: string;
  /**
   * Grouping id when the PMS bundles several reservations under one booking.
   * Optional — not all PMS have this concept.
   */
  bookingId?: string;
  createdAt?: IsoDateTime;
}

/** A guest's profile together with their reservation history. */
export interface GuestProfile {
  guest: Guest;
  /** Reservations linked to this guest, most recent first. */
  reservations: Reservation[];
}

/** Bookable availability for a unit group over a queried date range. */
export interface UnitGroupAvailability {
  unitGroupId: string;
  unitGroupName?: string;
  /**
   * Number of units bookable for the whole queried range (the limiting/minimum
   * count across the days in range).
   */
  available: number;
}

/** Availability snapshot for a property over a date range. */
export interface Availability {
  propertyId: string;
  from: IsoDate;
  to: IsoDate;
  unitGroups: UnitGroupAvailability[];
}

/**
 * Aggregate performance metrics for a property over a date range.
 *
 * Definitions (standard hotel KPIs), computed over the queried period:
 *  - `roomsAvailable`: total room-nights that could be sold.
 *  - `roomsSold`: total room-nights actually sold.
 *  - `occupancyRate`: roomsSold / roomsAvailable, in `[0, 1]`.
 *  - `roomRevenue`: total room revenue for the period.
 *  - `adr` (Average Daily Rate): roomRevenue / roomsSold.
 *  - `revPar` (Revenue Per Available Room): roomRevenue / roomsAvailable.
 *
 * When a PMS has no direct metrics endpoint, adapters derive these from
 * inventory + reservations and document how.
 */
export interface OccupancyKPIs {
  propertyId: string;
  from: IsoDate;
  to: IsoDate;
  roomsAvailable: number;
  roomsSold: number;
  occupancyRate: number;
  roomRevenue: Money;
  adr: Money;
  revPar: Money;
  /**
   * Plain-language description of exactly how these figures were derived, so
   * consumers always know what is being measured (e.g. booked vs realized,
   * net vs gross of tax, which unit types are included). Adapters must set it.
   */
  methodology: string;
}

/** Housekeeping state of a single unit. */
export interface HousekeepingStatus {
  unitId: string;
  unitName?: string;
  condition: HousekeepingCondition;
  /** Whether the unit is currently occupied, if known. */
  occupied?: boolean;
}
