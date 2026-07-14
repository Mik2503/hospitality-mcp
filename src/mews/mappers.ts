/**
 * Map Mews Connector API shapes into the normalized domain model.
 * No Mews-specific detail may leak past this file.
 */

import type {
  Guest,
  HousekeepingCondition,
  IsoDate,
  Property,
  Reservation,
  ReservationStatus,
} from "../core/index.js";
import type { MewsCustomer, MewsEnterprise, MewsReservation } from "./types.js";

/** Format a UTC instant as a calendar date in the given IANA time zone. */
export function localDate(utc: string, timeZone: string): IsoDate {
  // en-CA yields YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(arrival: IsoDate, departure: IsoDate): number {
  const ms =
    new Date(`${departure}T00:00:00Z`).getTime() -
    new Date(`${arrival}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Map a Mews reservation State onto the normalized status set. */
export function toReservationStatus(state: string | undefined): ReservationStatus {
  switch (state) {
    case "Enquired":
    case "Requested":
    case "Optional":
      return "pending";
    case "Confirmed":
      return "confirmed";
    case "Started":
      return "in_house";
    case "Processed":
      return "checked_out";
    case "Canceled":
      return "canceled";
    default:
      return "unknown";
  }
}

/** Map a Mews resource housekeeping State onto the normalized condition. */
export function toHousekeepingCondition(state: string | undefined): HousekeepingCondition {
  switch (state) {
    case "Clean":
      return "clean";
    case "Dirty":
      return "dirty";
    case "Inspected":
      return "inspected";
    default:
      // OutOfOrder / OutOfService / unknown -> never an active cleaning state.
      return "unknown";
  }
}

export function mapEnterpriseToProperty(e: MewsEnterprise): Property {
  const currency = e.Currencies?.find((c) => c.IsDefault)?.Currency;
  const a = e.Address ?? undefined;
  return {
    id: e.Id,
    name: e.Name ?? "(unnamed enterprise)",
    currencyCode: currency,
    timeZone: e.TimeZoneIdentifier,
    address: a
      ? {
          line1: a.Line1 ?? undefined,
          line2: a.Line2 ?? undefined,
          city: a.City ?? undefined,
          postalCode: a.PostalCode ?? undefined,
          region: a.CountrySubdivisionCode ?? undefined,
          countryCode: a.CountryCode ?? undefined,
        }
      : undefined,
  };
}

export function mapCustomerToGuest(c: MewsCustomer): Guest {
  return {
    id: c.Id,
    firstName: c.FirstName ?? undefined,
    lastName: c.LastName ?? undefined,
    email: c.Email ?? undefined,
    phone: c.Phone ?? undefined,
    nationalityCountryCode: c.NationalityCode ?? undefined,
  };
}

export interface ReservationContext {
  propertyId: string;
  timeZone: string;
  guest: Guest;
  unitGroupName?: string;
  unitName?: string;
}

export function mapReservation(r: MewsReservation, ctx: ReservationContext): Reservation {
  const arrival = r.StartUtc ? localDate(r.StartUtc, ctx.timeZone) : "";
  const departure = r.EndUtc ? localDate(r.EndUtc, ctx.timeZone) : "";
  // Mews carries occupancy as per-age-category person counts; without the age
  // category map we treat the total as adults (documented in docs/TODO.md).
  const persons = (r.PersonCounts ?? []).reduce((sum, p) => sum + (p.Count ?? 0), 0);

  return {
    id: r.Id,
    propertyId: ctx.propertyId,
    status: toReservationStatus(r.State),
    primaryGuest: ctx.guest,
    arrival,
    departure,
    nights: arrival && departure ? nightsBetween(arrival, departure) : 0,
    adults: persons > 0 ? persons : 1,
    children: 0,
    unitGroupId: r.RequestedResourceCategoryId ?? undefined,
    unitGroupName: ctx.unitGroupName,
    unitId: r.AssignedResourceId ?? undefined,
    unitName: ctx.unitName,
    ratePlanId: r.RateId ?? undefined,
    channel: r.Origin ?? undefined,
    bookingId: r.GroupId ?? undefined,
    createdAt: r.CreatedUtc,
  };
}
