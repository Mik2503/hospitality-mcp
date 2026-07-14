/**
 * Mews read adapter — implements the normalized {@link PMSAdapter} contract by
 * calling the Mews Connector API. Verified live against the public Mews demo.
 *
 * Scope of this first version (read-only):
 *  - listProperties, getArrivals, getDepartures, searchReservations,
 *    getReservation, getGuest, getHousekeeping are implemented.
 *  - getAvailability and getOccupancyKPIs throw {@link CapabilityNotSupportedError}
 *    for now — Mews availability/revenue modelling needs more work to map
 *    faithfully. Tracked in docs/TODO.md. (Per project rules we surface a clear
 *    "not supported yet" instead of inventing numbers.)
 *
 * Mews specifics handled here:
 *  - The Connector API is single-enterprise; the enterprise IS the property, so
 *    the `propertyId` argument is ignored.
 *  - Reservation Start/End are UTC instants; arrival/departure dates are the
 *    calendar dates in the enterprise time zone.
 *  - A reservation's guest is its `AccountId` resolved via customers/getAll.
 */

import type {
  Availability,
  GuestProfile,
  Guest,
  HousekeepingStatus,
  OccupancyKPIs,
  PMSAdapter,
  Property,
  Reservation,
} from "../core/index.js";
import { CapabilityNotSupportedError, NotFoundError } from "../core/index.js";
import type {
  ArrivalsQuery,
  AvailabilityQuery,
  GuestLookup,
  HousekeepingQuery,
  OccupancyQuery,
  ReservationSearchQuery,
} from "../core/index.js";
import type { Logger } from "../logger.js";
import type { MewsClient } from "./client.js";
import {
  addDays,
  mapCustomerToGuest,
  mapEnterpriseToProperty,
  mapReservation,
  toHousekeepingCondition,
} from "./mappers.js";
import type {
  MewsConfigurationResponse,
  MewsCustomersResponse,
  MewsReservation,
  MewsReservationsResponse,
  MewsResourcesResponse,
} from "./types.js";

const RESERVATIONS_OP = "reservations/getAll/2023-06-06";
const PAGE = 1000;
/** Default search window when the caller gives no date range (days). */
const SEARCH_BACK_DAYS = 30;
const SEARCH_FORWARD_DAYS = 60;

interface EnterpriseInfo {
  propertyId: string;
  timeZone: string;
  property: Property;
}

function byLastName(a: Reservation, b: Reservation): number {
  return (a.primaryGuest.lastName ?? "").localeCompare(b.primaryGuest.lastName ?? "");
}

function fullName(g: Guest): string {
  return `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim().toLowerCase();
}

export class MewsAdapter implements PMSAdapter {
  readonly name = "mews";

  private readonly client: MewsClient;
  private readonly logger: Logger;
  private enterprise?: EnterpriseInfo;
  private resourceNames?: Map<string, string>;
  private categoryNames?: Map<string, string>;

  constructor(client: MewsClient, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  // --- reference data (cached) --------------------------------------------

  private async loadEnterprise(): Promise<EnterpriseInfo> {
    if (this.enterprise) return this.enterprise;
    const res = await this.client.post<MewsConfigurationResponse>("configuration/get");
    const e = res.Enterprise;
    if (!e) throw new NotFoundError("enterprise", "(mews configuration)");
    this.enterprise = {
      propertyId: e.Id,
      timeZone: e.TimeZoneIdentifier ?? "UTC",
      property: mapEnterpriseToProperty(e),
    };
    return this.enterprise;
  }

  /** Lazily load resource (room) and category names for labelling. Best-effort. */
  private async loadResourceLabels(): Promise<void> {
    if (this.resourceNames) return;
    try {
      const res = await this.client.post<MewsResourcesResponse>("resources/getAll", {
        Limitation: { Count: PAGE },
      });
      this.resourceNames = new Map(
        (res.Resources ?? []).map((r) => [r.Id, r.Name ?? r.Id]),
      );
      this.categoryNames = new Map(
        (res.ResourceCategories ?? []).map((c) => {
          const names = c.Names ?? {};
          const label = names["en-US"] ?? Object.values(names)[0] ?? c.Id;
          return [c.Id, label];
        }),
      );
    } catch (error) {
      this.logger.warn(`Mews: could not load resource labels (${String(error)}). Names omitted.`);
      this.resourceNames = new Map();
      this.categoryNames = new Map();
    }
  }

  private async resolveGuests(accountIds: Array<string | null | undefined>): Promise<Map<string, Guest>> {
    const ids = [...new Set(accountIds.filter((x): x is string => Boolean(x)))];
    const map = new Map<string, Guest>();
    for (let i = 0; i < ids.length; i += PAGE) {
      const chunk = ids.slice(i, i + PAGE);
      const res = await this.client.post<MewsCustomersResponse>("customers/getAll", {
        CustomerIds: chunk,
      });
      for (const c of res.Customers ?? []) map.set(c.Id, mapCustomerToGuest(c));
    }
    return map;
  }

  /** Fetch reservations for a body, resolve guests + labels, and map them. */
  private async fetchReservations(body: Record<string, unknown>): Promise<Reservation[]> {
    const info = await this.loadEnterprise();
    await this.loadResourceLabels();
    const res = await this.client.post<MewsReservationsResponse>(RESERVATIONS_OP, body);
    const raws: MewsReservation[] = res.Reservations ?? [];
    const guests = await this.resolveGuests(raws.map((r) => r.AccountId));

    return raws.map((r) =>
      mapReservation(r, {
        propertyId: info.propertyId,
        timeZone: info.timeZone,
        guest: r.AccountId ? guests.get(r.AccountId) ?? {} : {},
        unitGroupName: r.RequestedResourceCategoryId
          ? this.categoryNames?.get(r.RequestedResourceCategoryId)
          : undefined,
        unitName: r.AssignedResourceId
          ? this.resourceNames?.get(r.AssignedResourceId)
          : undefined,
      }),
    );
  }

  // --- properties ---------------------------------------------------------

  async listProperties(): Promise<Property[]> {
    return [(await this.loadEnterprise()).property];
  }

  // --- reservations -------------------------------------------------------

  async getArrivals(query: ArrivalsQuery): Promise<Reservation[]> {
    return this.reservationsOnDate(query.date, "Start", (r) => r.arrival);
  }

  async getDepartures(query: ArrivalsQuery): Promise<Reservation[]> {
    return this.reservationsOnDate(query.date, "End", (r) => r.departure);
  }

  private async reservationsOnDate(
    date: string,
    timeFilter: "Start" | "End",
    pick: (r: Reservation) => string,
  ): Promise<Reservation[]> {
    const list = await this.fetchReservations({
      StartUtc: `${addDays(date, -1)}T00:00:00Z`,
      EndUtc: `${addDays(date, 2)}T00:00:00Z`,
      TimeFilter: timeFilter,
      Limitation: { Count: PAGE },
    });
    return list
      .filter((r) => pick(r) === date && r.status !== "canceled" && r.status !== "no_show")
      .sort(byLastName);
  }

  async searchReservations(query: ReservationSearchQuery): Promise<Reservation[]> {
    const today = new Date().toISOString().slice(0, 10);
    const from = query.dateRange?.from ?? addDays(today, -SEARCH_BACK_DAYS);
    const to = query.dateRange?.to ?? addDays(today, SEARCH_FORWARD_DAYS);
    const timeFilter =
      query.dateRange?.type === "arrival"
        ? "Start"
        : query.dateRange?.type === "departure"
          ? "End"
          : "Colliding";

    let list = await this.fetchReservations({
      StartUtc: `${from}T00:00:00Z`,
      EndUtc: `${to}T23:59:59Z`,
      TimeFilter: timeFilter,
      Limitation: { Count: query.limit ?? PAGE },
    });

    if (query.guestName) {
      const needle = query.guestName.toLowerCase();
      list = list.filter((r) => fullName(r.primaryGuest).includes(needle));
    }
    if (query.status?.length) {
      const wanted = new Set(query.status);
      list = list.filter((r) => wanted.has(r.status));
    }
    return list.slice(0, query.limit ?? list.length);
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    const list = await this.fetchReservations({ ReservationIds: [reservationId] });
    const found = list.find((r) => r.id === reservationId);
    if (!found) throw new NotFoundError("reservation", reservationId);
    return found;
  }

  // --- guest --------------------------------------------------------------

  async getGuest(lookup: GuestLookup): Promise<GuestProfile> {
    const filter: Record<string, unknown> = {};
    if (lookup.guestId) filter.CustomerIds = [lookup.guestId];
    else if (lookup.email) filter.Emails = [lookup.email];
    else if (lookup.name) {
      const parts = lookup.name.trim().split(/\s+/);
      filter.LastNames = [parts[parts.length - 1]];
      if (parts.length > 1) filter.FirstNames = [parts[0]];
    } else {
      throw new NotFoundError("guest", "(no email, name, or id provided)");
    }

    const customers = (
      await this.client.post<MewsCustomersResponse>("customers/getAll", filter)
    ).Customers ?? [];
    if (customers.length === 0) {
      throw new NotFoundError("guest", lookup.email ?? lookup.name ?? lookup.guestId ?? "");
    }

    const info = await this.loadEnterprise();
    const guest = mapCustomerToGuest(customers[0]!);
    const today = new Date().toISOString().slice(0, 10);

    // Their reservations across a wide window, filtered to this account.
    const accountIds = new Set(customers.map((c) => c.Id));
    const all = await this.fetchReservationsRaw({
      StartUtc: `${addDays(today, -365)}T00:00:00Z`,
      EndUtc: `${addDays(today, 365)}T00:00:00Z`,
      TimeFilter: "Colliding",
      CustomerIds: [...accountIds],
      Limitation: { Count: PAGE },
    });
    const reservations = all
      .filter((r) => r.AccountId && accountIds.has(r.AccountId))
      .map((r) =>
        mapReservation(r, {
          propertyId: info.propertyId,
          timeZone: info.timeZone,
          guest,
          unitGroupName: r.RequestedResourceCategoryId
            ? this.categoryNames?.get(r.RequestedResourceCategoryId)
            : undefined,
          unitName: r.AssignedResourceId ? this.resourceNames?.get(r.AssignedResourceId) : undefined,
        }),
      )
      .sort((a, b) => (a.arrival < b.arrival ? 1 : -1));

    return { guest, reservations };
  }

  /** Like fetchReservations but returns raw rows (used by getGuest). */
  private async fetchReservationsRaw(body: Record<string, unknown>): Promise<MewsReservation[]> {
    await this.loadResourceLabels();
    const res = await this.client.post<MewsReservationsResponse>(RESERVATIONS_OP, body);
    return res.Reservations ?? [];
  }

  // --- housekeeping -------------------------------------------------------

  async getHousekeeping(query: HousekeepingQuery): Promise<HousekeepingStatus[]> {
    void query; // Mews is single-enterprise; propertyId/unitGroupId not used here.
    const res = await this.client.post<MewsResourcesResponse>("resources/getAll", {
      Limitation: { Count: PAGE },
    });
    return (res.Resources ?? [])
      .filter((r) => r.IsActive !== false && r.State)
      .map((r) => ({
        unitId: r.Id,
        unitName: r.Name,
        condition: toHousekeepingCondition(r.State),
      }));
  }

  // --- not yet supported for Mews ----------------------------------------

  async getAvailability(_query: AvailabilityQuery): Promise<Availability> {
    throw new CapabilityNotSupportedError("availability", this.name);
  }

  async getOccupancyKPIs(_query: OccupancyQuery): Promise<OccupancyKPIs> {
    throw new CapabilityNotSupportedError("occupancy KPIs", this.name);
  }
}
