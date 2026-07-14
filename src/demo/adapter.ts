/**
 * Demo read adapter — implements the normalized {@link PMSAdapter} contract
 * against a built-in SYNTHETIC dataset (see {@link buildDemoData}). No network,
 * no credentials, not a real hotel.
 *
 * It is intentionally read-only: it does NOT implement WritablePMSAdapter, so
 * the write tools never appear in demo mode.
 */

import type {
  Availability,
  GuestProfile,
  Guest,
  HousekeepingCondition,
  HousekeepingStatus,
  Money,
  OccupancyKPIs,
  PMSAdapter,
  Property,
  Reservation,
} from "../core/index.js";
import { NotFoundError } from "../core/index.js";
import type {
  ArrivalsQuery,
  AvailabilityQuery,
  GuestLookup,
  HousekeepingQuery,
  OccupancyQuery,
  ReservationSearchQuery,
} from "../core/index.js";
import type { Logger } from "../logger.js";
import { buildDemoData, diffDays, overlapNights, toIso, type DemoData } from "./data.js";

const CURRENCY = "EUR";
const CONDITIONS: HousekeepingCondition[] = [
  "clean",
  "dirty",
  "cleaning_in_progress",
  "inspected",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fullName(guest: Guest): string {
  return `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim().toLowerCase();
}

function byLastName(a: Reservation, b: Reservation): number {
  return (a.primaryGuest.lastName ?? "").localeCompare(b.primaryGuest.lastName ?? "");
}

function isActive(r: Reservation): boolean {
  return r.status !== "canceled" && r.status !== "no_show";
}

export interface DemoAdapterOptions {
  /** Override "today" (YYYY-MM-DD). Defaults to the current UTC date. */
  today?: string;
}

export class DemoAdapter implements PMSAdapter {
  readonly name = "demo";

  private readonly data: DemoData;

  constructor(logger: Logger, options: DemoAdapterOptions = {}) {
    const today = options.today ?? toIso(new Date());
    this.data = buildDemoData(today);
    logger.debug(
      `Demo adapter ready: ${this.data.reservations.length} synthetic reservations across ${this.data.properties.length} properties (today=${today}).`,
    );
  }

  async listProperties(): Promise<Property[]> {
    return this.data.properties;
  }

  async getArrivals(query: ArrivalsQuery): Promise<Reservation[]> {
    return this.data.reservations
      .filter((r) => r.propertyId === query.propertyId && r.arrival === query.date && isActive(r))
      .sort(byLastName);
  }

  async getDepartures(query: ArrivalsQuery): Promise<Reservation[]> {
    return this.data.reservations
      .filter((r) => r.propertyId === query.propertyId && r.departure === query.date && isActive(r))
      .sort(byLastName);
  }

  async searchReservations(query: ReservationSearchQuery): Promise<Reservation[]> {
    let results = this.data.reservations;

    if (query.propertyId) {
      results = results.filter((r) => r.propertyId === query.propertyId);
    }
    if (query.guestName) {
      const needle = query.guestName.toLowerCase();
      results = results.filter((r) => fullName(r.primaryGuest).includes(needle));
    }
    if (query.status?.length) {
      const wanted = new Set(query.status);
      results = results.filter((r) => wanted.has(r.status));
    }
    if (query.dateRange) {
      const { from, to, type } = query.dateRange;
      results = results.filter((r) => {
        if (type === "arrival") return r.arrival >= from && r.arrival <= to;
        if (type === "departure") return r.departure >= from && r.departure <= to;
        // "stay": the reservation overlaps the window at all.
        return r.arrival <= to && r.departure >= from;
      });
    }

    const sorted = [...results].sort((a, b) => (a.arrival < b.arrival ? -1 : 1));
    const limit = query.limit ?? sorted.length;
    return sorted.slice(0, limit);
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    const found = this.data.reservations.find((r) => r.id === reservationId);
    if (!found) throw new NotFoundError("reservation", reservationId);
    return found;
  }

  async getAvailability(query: AvailabilityQuery): Promise<Availability> {
    const unitGroups = this.data.unitGroups
      .filter((g) => !query.unitGroupId || g.id === query.unitGroupId)
      .filter((g) => query.adults === undefined || (g.maxPersons ?? 0) >= query.adults)
      .map((g) => {
        const booked = this.data.reservations.filter(
          (r) =>
            r.propertyId === query.propertyId &&
            r.unitGroupId === g.id &&
            isActive(r) &&
            r.arrival < query.to &&
            r.departure > query.from,
        ).length;
        return {
          unitGroupId: g.id,
          unitGroupName: g.name,
          available: Math.max(0, (g.unitCount ?? 0) - booked),
        };
      });

    return { propertyId: query.propertyId, from: query.from, to: query.to, unitGroups };
  }

  async getGuest(lookup: GuestLookup): Promise<GuestProfile> {
    const term = (lookup.email ?? lookup.name ?? lookup.guestId ?? "").trim();
    if (!term) throw new NotFoundError("guest", "(no email, name, or id provided)");
    const needle = term.toLowerCase();

    const matches = this.data.reservations.filter((r) => {
      if (lookup.propertyId && r.propertyId !== lookup.propertyId) return false;
      const g = r.primaryGuest;
      return (
        g.email?.toLowerCase() === needle ||
        g.id?.toLowerCase() === needle ||
        fullName(g).includes(needle)
      );
    });

    if (matches.length === 0) throw new NotFoundError("guest", term);

    const reservations = [...matches].sort((a, b) => (a.arrival < b.arrival ? 1 : -1));
    return { guest: reservations[0]!.primaryGuest, reservations };
  }

  async getOccupancyKPIs(query: OccupancyQuery): Promise<OccupancyKPIs> {
    const nights = Math.max(0, diffDays(query.to, query.from));
    const units = this.data.unitsByProperty[query.propertyId]?.length ?? 0;
    const roomsAvailable = units * nights;

    let roomsSold = 0;
    let revenue = 0;
    for (const r of this.data.reservations) {
      if (r.propertyId !== query.propertyId || !isActive(r)) continue;
      const soldNights = overlapNights(r.arrival, r.departure, query.from, query.to);
      if (soldNights <= 0) continue;
      roomsSold += soldNights;
      const nightly = (r.totalAmount?.amount ?? 0) / (r.nights || 1);
      revenue += nightly * soldNights;
    }
    revenue = round2(revenue);

    const money = (amount: number): Money => ({ amount, currency: CURRENCY });
    return {
      propertyId: query.propertyId,
      from: query.from,
      to: query.to,
      roomsAvailable,
      roomsSold,
      occupancyRate: roomsAvailable > 0 ? round2(roomsSold / roomsAvailable) : 0,
      roomRevenue: money(revenue),
      adr: money(roomsSold > 0 ? round2(revenue / roomsSold) : 0),
      revPar: money(roomsAvailable > 0 ? round2(revenue / roomsAvailable) : 0),
      methodology:
        "SYNTHETIC DEMO DATA — not a real hotel. Booked room revenue (gross), " +
        "room-only, over [from, to) (checkout day excluded), excluding canceled/no-show.",
    };
  }

  async getHousekeeping(query: HousekeepingQuery): Promise<HousekeepingStatus[]> {
    const units = this.data.unitsByProperty[query.propertyId] ?? [];
    const occupiedUnitIds = new Set(
      this.data.reservations
        .filter((r) => r.propertyId === query.propertyId && r.status === "in_house" && r.unitId)
        .map((r) => r.unitId),
    );

    return units
      .filter((u) => !query.unitGroupId || u.unitGroupId === query.unitGroupId)
      .map((u, i) => ({
        unitId: u.id,
        unitName: u.name,
        condition: CONDITIONS[i % CONDITIONS.length]!,
        occupied: occupiedUnitIds.has(u.id),
      }));
  }
}
