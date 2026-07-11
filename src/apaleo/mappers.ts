/**
 * Pure mappers: Apaleo raw shapes -> normalized domain types.
 *
 * These functions are the translation layer. They are pure (no I/O), tolerant
 * of missing fields, and the only code that "knows" both sides. Everything they
 * RETURN is a normalized `core` type; nothing Apaleo-specific escapes.
 */

import type {
  Address,
  Availability,
  Guest,
  HousekeepingCondition,
  HousekeepingStatus,
  Money,
  Property,
  Reservation,
  ReservationStatus,
  UnitGroupAvailability,
} from "../core/index.js";
import { diffDays, localDate } from "./dates.js";
import type { Logger } from "../logger.js";
import type {
  ApaleoAddress,
  ApaleoAmount,
  ApaleoAvailabilityResponse,
  ApaleoGuest,
  ApaleoProperty,
  ApaleoReservation,
  ApaleoUnit,
} from "./types.js";

// --- status mapping -------------------------------------------------------

const APALEO_TO_STATUS: Record<string, ReservationStatus> = {
  Confirmed: "confirmed",
  InHouse: "in_house",
  CheckedOut: "checked_out",
  Canceled: "canceled",
  NoShow: "no_show",
};

const STATUS_TO_APALEO: Partial<Record<ReservationStatus, string>> = {
  confirmed: "Confirmed",
  in_house: "InHouse",
  checked_out: "CheckedOut",
  canceled: "Canceled",
  no_show: "NoShow",
};

/**
 * Map an Apaleo reservation status to the normalized status.
 *
 * A value we don't recognize maps to `"unknown"` — NEVER to an active state.
 * It is safer to admit we don't know the status than to falsely assert the
 * reservation is active. Unrecognized values are logged so they surface.
 */
export function toReservationStatus(
  raw: string | undefined,
  logger?: Logger,
): ReservationStatus {
  if (raw && raw in APALEO_TO_STATUS) return APALEO_TO_STATUS[raw]!;
  logger?.warn(
    `Unrecognized Apaleo reservation status ${JSON.stringify(raw)}; mapping to "unknown".`,
  );
  return "unknown";
}

/** Map a normalized status to the Apaleo value, if one exists. */
export function toApaleoStatus(status: ReservationStatus): string | undefined {
  return STATUS_TO_APALEO[status];
}

const APALEO_TO_CONDITION: Record<string, HousekeepingCondition> = {
  Clean: "clean",
  Dirty: "dirty",
  CleaningInProgress: "cleaning_in_progress",
  Inspected: "inspected",
};

function toHousekeepingCondition(raw: string | undefined): HousekeepingCondition {
  if (raw && raw in APALEO_TO_CONDITION) return APALEO_TO_CONDITION[raw]!;
  return "unknown";
}

// --- value objects --------------------------------------------------------

function toMoney(amount: ApaleoAmount | undefined): Money | undefined {
  if (!amount || typeof amount.amount !== "number") return undefined;
  return { amount: amount.amount, currency: amount.currency ?? "" };
}

function toAddress(address: ApaleoAddress | undefined): Address | undefined {
  if (!address) return undefined;
  const mapped: Address = {};
  if (address.addressLine1) mapped.line1 = address.addressLine1;
  if (address.addressLine2) mapped.line2 = address.addressLine2;
  if (address.city) mapped.city = address.city;
  if (address.postalCode) mapped.postalCode = address.postalCode;
  if (address.countryCode) mapped.countryCode = address.countryCode;
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

// --- entities -------------------------------------------------------------

export function mapProperty(raw: ApaleoProperty): Property {
  const property: Property = {
    id: raw.id ?? "",
    name: raw.name ?? raw.code ?? raw.id ?? "",
  };
  if (raw.currencyCode) property.currencyCode = raw.currencyCode;
  if (raw.timeZone) property.timeZone = raw.timeZone;
  const address = toAddress(raw.location);
  if (address) property.address = address;
  return property;
}

export function mapGuest(raw: ApaleoGuest | undefined): Guest {
  const guest: Guest = {};
  if (raw?.firstName) guest.firstName = raw.firstName;
  if (raw?.lastName) guest.lastName = raw.lastName;
  if (raw?.email) guest.email = raw.email;
  if (raw?.phone) guest.phone = raw.phone;
  if (raw?.nationalityCountryCode) {
    guest.nationalityCountryCode = raw.nationalityCountryCode;
  }
  const address = toAddress(raw?.address);
  if (address) guest.address = address;
  return guest;
}

export function mapReservation(raw: ApaleoReservation, logger?: Logger): Reservation {
  const arrival = localDate(raw.arrival);
  const departure = localDate(raw.departure);
  const nights = arrival && departure ? Math.max(0, diffDays(departure, arrival)) : 0;

  const reservation: Reservation = {
    id: raw.id ?? "",
    propertyId: raw.property?.id ?? "",
    status: toReservationStatus(raw.status, logger),
    primaryGuest: mapGuest(raw.primaryGuest),
    arrival,
    departure,
    nights,
    adults: raw.adults ?? 0,
    children: raw.children ?? raw.childrenAges?.length ?? 0,
  };

  if (raw.unitGroup?.id) reservation.unitGroupId = raw.unitGroup.id;
  if (raw.unitGroup?.name) reservation.unitGroupName = raw.unitGroup.name;
  if (raw.unit?.id) reservation.unitId = raw.unit.id;
  if (raw.unit?.name) reservation.unitName = raw.unit.name;
  if (raw.ratePlan?.id) reservation.ratePlanId = raw.ratePlan.id;
  if (raw.channelCode) reservation.channel = raw.channelCode;
  const total = toMoney(raw.totalGrossAmount);
  if (total) reservation.totalAmount = total;
  const balance = toMoney(raw.balance);
  if (balance) reservation.balance = balance;
  if (raw.bookingId) reservation.bookingId = raw.bookingId;
  if (raw.created) reservation.createdAt = raw.created;

  return reservation;
}

export function mapUnitToHousekeeping(raw: ApaleoUnit): HousekeepingStatus {
  const status: HousekeepingStatus = {
    unitId: raw.id ?? "",
    condition: toHousekeepingCondition(raw.status?.condition),
  };
  if (raw.name) status.unitName = raw.name;
  if (typeof raw.status?.isOccupied === "boolean") {
    status.occupied = raw.status.isOccupied;
  }
  return status;
}

/**
 * Aggregate Apaleo's per-time-slice availability into one figure per unit group
 * for the whole range: the MINIMUM available count across the slices (the
 * limiting number of units bookable for every night in the range).
 */
export function mapAvailability(
  propertyId: string,
  from: string,
  to: string,
  raw: ApaleoAvailabilityResponse,
): Availability {
  const minByGroup = new Map<string, UnitGroupAvailability>();

  for (const slice of raw.timeSlices ?? []) {
    for (const group of slice.unitGroups ?? []) {
      const id = group.unitGroup?.id;
      if (!id) continue;
      const available = group.availableCount ?? 0;
      const existing = minByGroup.get(id);
      if (!existing) {
        const entry: UnitGroupAvailability = { unitGroupId: id, available };
        if (group.unitGroup?.name) entry.unitGroupName = group.unitGroup.name;
        minByGroup.set(id, entry);
      } else if (available < existing.available) {
        existing.available = available;
      }
    }
  }

  return {
    propertyId,
    from,
    to,
    unitGroups: [...minByGroup.values()],
  };
}
