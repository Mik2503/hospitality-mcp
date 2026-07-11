/**
 * Apaleo read adapter — implements the normalized {@link PMSAdapter} contract by
 * calling the Apaleo API and mapping responses into domain types.
 *
 * Endpoints & quirks verified live against the Apaleo sandbox:
 *  - Reservations are filtered with `propertyIds` (PLURAL); `propertyId` is
 *    silently ignored on that endpoint.
 *  - `dateFilter` needs full date-times for `from`/`to` (date-only -> 422).
 *  - Empty list results come back as HTTP 204 (no body).
 *  - Pagination uses `pageNumber` (1-based) + `pageSize`.
 *  - Availability accepts date-only `from`/`to` and returns per-time-slice
 *    counts we aggregate for KPIs.
 *  - Housekeeping comes from `unit.status` on the inventory endpoint.
 */

import type {
  Availability,
  GuestProfile,
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
import type { ApaleoClient, QueryValue } from "./client.js";
import { ApaleoApiError } from "./errors.js";
import { addDays, localDate, round2 } from "./dates.js";
import {
  mapAvailability,
  mapProperty,
  mapReservation,
  mapUnitToHousekeeping,
  toApaleoStatus,
} from "./mappers.js";
import type {
  ApaleoAvailabilityResponse,
  ApaleoProperty,
  ApaleoReservation,
  ApaleoReservationsResponse,
  ApaleoUnit,
} from "./types.js";
import type { Logger } from "../logger.js";

const RESERVATION_EXPAND = "primaryGuest,unitGroup,unit,ratePlan";
const DEFAULT_PAGE_SIZE = 100;
/** Safety cap on how many items we page through for one call. */
const DEFAULT_MAX_ITEMS = 1000;

export interface ApaleoAdapterOptions {
  /** Cap on items paged through per listing call. Default 1000. */
  maxItems?: number;
}

export class ApaleoAdapter implements PMSAdapter {
  readonly name = "apaleo";

  private readonly client: ApaleoClient;
  private readonly logger: Logger;
  private readonly maxItems: number;

  constructor(client: ApaleoClient, logger: Logger, options: ApaleoAdapterOptions = {}) {
    this.client = client;
    this.logger = logger;
    this.maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  }

  // --- properties ---------------------------------------------------------

  async listProperties(): Promise<Property[]> {
    const raw = await this.paginate<ApaleoProperty>(
      "/inventory/v1/properties",
      {},
      "properties",
    );
    return raw.filter((p) => !p.isArchived).map(mapProperty);
  }

  // --- reservations -------------------------------------------------------

  async getArrivals(query: ArrivalsQuery): Promise<Reservation[]> {
    return this.reservationsOnDate(query.propertyId, query.date, "Arrival");
  }

  async getDepartures(query: ArrivalsQuery): Promise<Reservation[]> {
    return this.reservationsOnDate(query.propertyId, query.date, "Departure");
  }

  async searchReservations(query: ReservationSearchQuery): Promise<Reservation[]> {
    const params: Record<string, QueryValue> = {};
    if (query.propertyId) params.propertyIds = [query.propertyId];
    if (query.guestName) params.textSearch = query.guestName;

    // Server-side status filter only when every requested status maps to Apaleo.
    if (query.status?.length) {
      const mapped = query.status
        .map(toApaleoStatus)
        .filter((s): s is string => s !== undefined);
      if (mapped.length === query.status.length) params.status = mapped;
    }

    if (query.dateRange) {
      params.dateFilter =
        query.dateRange.type === "arrival"
          ? "Arrival"
          : query.dateRange.type === "departure"
            ? "Departure"
            : "Stay";
      // dateFilter requires full date-times.
      params.from = `${query.dateRange.from}T00:00:00Z`;
      params.to = `${query.dateRange.to}T23:59:59Z`;
    }

    const limit = query.limit ?? this.maxItems;
    const raw = await this.paginate<ApaleoReservation>(
      "/booking/v1/reservations",
      { ...params, expand: RESERVATION_EXPAND },
      "reservations",
      limit,
    );

    let reservations = raw.map((r) => mapReservation(r, this.logger));
    // If we couldn't push the status filter to the server, filter locally.
    if (query.status?.length && params.status === undefined) {
      const wanted = new Set(query.status);
      reservations = reservations.filter((r) => wanted.has(r.status));
    }
    return reservations.slice(0, limit);
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    try {
      const raw = await this.client.get<ApaleoReservation>(
        `/booking/v1/reservations/${encodeURIComponent(reservationId)}`,
        { expand: `${RESERVATION_EXPAND},timeSlices` },
      );
      return mapReservation(raw, this.logger);
    } catch (error) {
      if (error instanceof ApaleoApiError && error.status === 404) {
        throw new NotFoundError("reservation", reservationId);
      }
      throw error;
    }
  }

  // --- availability -------------------------------------------------------

  async getAvailability(query: AvailabilityQuery): Promise<Availability> {
    const params: Record<string, QueryValue> = {
      propertyId: query.propertyId,
      from: query.from,
      to: query.to,
    };
    if (query.adults !== undefined) params.adults = query.adults;

    const raw = await this.client.get<ApaleoAvailabilityResponse>(
      "/availability/v1/unit-groups",
      params,
    );

    const availability = mapAvailability(
      query.propertyId,
      query.from,
      query.to,
      raw ?? {},
    );
    if (query.unitGroupId) {
      availability.unitGroups = availability.unitGroups.filter(
        (g) => g.unitGroupId === query.unitGroupId,
      );
    }
    return availability;
  }

  // --- guest --------------------------------------------------------------

  async getGuest(lookup: GuestLookup): Promise<GuestProfile> {
    const term = lookup.email ?? lookup.name ?? lookup.guestId;
    if (!term) {
      throw new NotFoundError("guest", "(no email, name, or id provided)");
    }

    const params: Record<string, QueryValue> = { textSearch: term };
    if (lookup.propertyId) params.propertyIds = [lookup.propertyId];

    const raw = await this.paginate<ApaleoReservation>(
      "/booking/v1/reservations",
      { ...params, expand: RESERVATION_EXPAND },
      "reservations",
    );

    if (raw.length === 0) throw new NotFoundError("guest", term);

    const reservations = raw
      .map((r) => mapReservation(r, this.logger))
      .sort((a, b) => (a.arrival < b.arrival ? 1 : -1));

    // Use the most recent reservation's guest as the canonical profile.
    const guest = reservations[0]!.primaryGuest;
    return { guest, reservations };
  }

  // --- KPIs ---------------------------------------------------------------

  /**
   * Occupancy / ADR / RevPAR, derived because Apaleo has no single metrics
   * endpoint. Method (all figures cover room-nights in the half-open window
   * `[from, to)` — i.e. the checkout day is excluded — and count BEDROOMS only,
   * excluding meeting rooms and other non-bedroom unit groups):
   *  - Occupancy from the availability endpoint's per-unit-group counts:
   *    roomsAvailable = Σ physicalCount, roomsSold = Σ soldCount.
   *  - Room revenue from reservation time-slices: Σ baseAmount.netAmount for
   *    bedroom stays with a service date in the window, excluding canceled /
   *    no-show reservations. This is booked room revenue, NET of VAT and
   *    excluding extra services.
   *  - ADR = revenue / roomsSold; RevPAR = revenue / roomsAvailable.
   *
   * The returned `methodology` string states these choices explicitly so
   * consumers always know what the numbers mean.
   */
  async getOccupancyKPIs(query: OccupancyQuery): Promise<OccupancyKPIs> {
    const availability = await this.client.get<ApaleoAvailabilityResponse>(
      "/availability/v1/unit-groups",
      { propertyId: query.propertyId, from: query.from, to: query.to },
    );

    // Apaleo returns one slice per day INCLUSIVE of `to`; keep only the nights
    // in the half-open window and only bedroom-type unit groups.
    let roomsAvailable = 0;
    let roomsSold = 0;
    for (const slice of availability?.timeSlices ?? []) {
      const sliceDate = localDate(slice.from);
      if (sliceDate < query.from || sliceDate >= query.to) continue;
      for (const group of slice.unitGroups ?? []) {
        if (group.unitGroup?.type !== "BedRoom") continue;
        roomsAvailable += group.physicalCount ?? 0;
        roomsSold += group.soldCount ?? 0;
      }
    }

    // Room revenue from bedroom reservations staying in the period.
    const reservations = await this.paginate<ApaleoReservation>(
      "/booking/v1/reservations",
      {
        propertyIds: [query.propertyId],
        dateFilter: "Stay",
        from: `${query.from}T00:00:00Z`,
        to: `${query.to}T23:59:59Z`,
        expand: "timeSlices,unitGroup",
      },
      "reservations",
    );

    let revenue = 0;
    let currency = "";
    for (const reservation of reservations) {
      if (reservation.status === "Canceled" || reservation.status === "NoShow") {
        continue;
      }
      if (reservation.unitGroup?.type && reservation.unitGroup.type !== "BedRoom") {
        continue;
      }
      for (const slice of reservation.timeSlices ?? []) {
        const serviceDate = slice.serviceDate ?? localDate(slice.from);
        if (serviceDate >= query.from && serviceDate < query.to) {
          revenue += slice.baseAmount?.netAmount ?? 0;
          currency ||= slice.baseAmount?.currency ?? "";
        }
      }
    }
    revenue = round2(revenue);

    const money = (amount: number): Money => ({ amount, currency });
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
        "Booked ADR/RevPAR, net of VAT, room-only (excludes extra services), " +
        "bedrooms only (excludes meeting rooms), excludes canceled/no-show. " +
        "Room-nights counted over [from, to) (checkout day excluded). " +
        "Derived from Apaleo availability + reservation rates (no folio/realized revenue).",
    };
  }

  // --- housekeeping -------------------------------------------------------

  async getHousekeeping(query: HousekeepingQuery): Promise<HousekeepingStatus[]> {
    const params: Record<string, QueryValue> = { propertyId: query.propertyId };
    if (query.unitGroupId) params.unitGroupId = query.unitGroupId;

    const raw = await this.paginate<ApaleoUnit>(
      "/inventory/v1/units",
      params,
      "units",
    );
    return raw.filter((u) => !u.isArchived).map(mapUnitToHousekeeping);
  }

  // --- helpers ------------------------------------------------------------

  /** Fetch reservations arriving/departing on a specific local date. */
  private async reservationsOnDate(
    propertyId: string,
    date: string,
    dateFilter: "Arrival" | "Departure",
  ): Promise<Reservation[]> {
    // Query a window wide enough to cover the local day in any time zone, then
    // filter by the reservation's local calendar date for exactness.
    const raw = await this.paginate<ApaleoReservation>(
      "/booking/v1/reservations",
      {
        propertyIds: [propertyId],
        dateFilter,
        from: `${addDays(date, -1)}T00:00:00Z`,
        to: `${addDays(date, 1)}T23:59:59Z`,
        expand: RESERVATION_EXPAND,
      },
      "reservations",
    );

    const key = dateFilter === "Arrival" ? "arrival" : "departure";
    return raw
      .map((r) => mapReservation(r, this.logger))
      .filter((r) => r[key] === date)
      .sort((a, b) => (a.primaryGuest.lastName ?? "").localeCompare(b.primaryGuest.lastName ?? ""));
  }

  /**
   * Page through an Apaleo list endpoint using pageNumber/pageSize until the
   * reported `count` is reached, a page comes back empty (or 204), or the
   * safety cap is hit. Logs when the cap truncates results.
   */
  private async paginate<T>(
    path: string,
    query: Record<string, QueryValue>,
    arrayKey: string,
    max = this.maxItems,
  ): Promise<T[]> {
    const items: T[] = [];
    let pageNumber = 1;

    while (items.length < max) {
      const response = await this.client.get<Record<string, unknown> | undefined>(
        path,
        { ...query, pageSize: DEFAULT_PAGE_SIZE, pageNumber },
      );
      // 204/empty responses come back undefined.
      const page = (response?.[arrayKey] as T[] | undefined) ?? [];
      if (page.length === 0) break;

      items.push(...page);

      const total = (response?.count as number | undefined) ?? items.length;
      if (items.length >= total) break;
      pageNumber += 1;
    }

    if (items.length >= max) {
      // Only warn when we hit the safety cap, not a smaller caller-provided
      // limit (that truncation is intentional, not surprising).
      if (max >= this.maxItems) {
        this.logger.warn(
          `Apaleo ${path}: result capped at ${max} items; some data may be omitted.`,
        );
      }
      return items.slice(0, max);
    }
    return items;
  }
}
