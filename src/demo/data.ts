/**
 * Built-in SYNTHETIC dataset for demo mode. Anchored on a "today" date so that
 * "who arrives today?", occupancy, etc. always return meaningful results no
 * matter when the server runs.
 *
 * This is NOT real hotel data. Property names carry a "(SAMPLE DATA)" marker and
 * guests are famous historical computing/science figures, so it is always
 * obvious the data is fictional.
 */

import type {
  IsoDate,
  Property,
  Reservation,
  ReservationStatus,
  Unit,
  UnitGroup,
} from "../core/index.js";

// --- tiny UTC date helpers (self-contained; no provider deps) --------------

function parseIso(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}
export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}
export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(a).getTime() - parseIso(b).getTime()) / 86_400_000);
}
/** Overlap in nights between [aFrom, aTo) and [bFrom, bTo). */
export function overlapNights(
  aFrom: IsoDate,
  aTo: IsoDate,
  bFrom: IsoDate,
  bTo: IsoDate,
): number {
  const from = aFrom > bFrom ? aFrom : bFrom;
  const to = aTo < bTo ? aTo : bTo;
  return Math.max(0, diffDays(to, from));
}

// --- static catalogue -------------------------------------------------------

const CURRENCY = "EUR";

const PROPERTIES: Property[] = [
  {
    id: "DEMO-BER",
    name: "Demo Grand Hotel Berlin (SAMPLE DATA)",
    currencyCode: CURRENCY,
    timeZone: "Europe/Berlin",
    address: { city: "Berlin", countryCode: "DE" },
  },
  {
    id: "DEMO-MUC",
    name: "Demo Riverside Munich (SAMPLE DATA)",
    currencyCode: CURRENCY,
    timeZone: "Europe/Berlin",
    address: { city: "Munich", countryCode: "DE" },
  },
];

const UNIT_GROUPS: UnitGroup[] = [
  { id: "SGL", name: "Single", code: "SGL", maxPersons: 1, unitCount: 10 },
  { id: "DBL", name: "Double Standard", code: "DBL", maxPersons: 2, unitCount: 20 },
  { id: "SUI", name: "Suite", code: "SUI", maxPersons: 4, unitCount: 5 },
];

/** First room number for each unit group (rooms are numbered sequentially). */
const GROUP_FIRST_ROOM: Record<string, number> = { SGL: 101, DBL: 201, SUI: 301 };
/** Nightly gross rate per unit group, in EUR. */
const GROUP_RATE: Record<string, number> = { SGL: 90, DBL: 140, SUI: 300 };

const GUESTS = [
  { firstName: "Ada", lastName: "Lovelace", email: "ada.lovelace@example.com", nationalityCountryCode: "GB" },
  { firstName: "Alan", lastName: "Turing", email: "alan.turing@example.com", nationalityCountryCode: "GB" },
  { firstName: "Grace", lastName: "Hopper", email: "grace.hopper@example.com", nationalityCountryCode: "US" },
  { firstName: "Katherine", lastName: "Johnson", email: "katherine.johnson@example.com", nationalityCountryCode: "US" },
  { firstName: "Tim", lastName: "Berners-Lee", email: "tim.bl@example.com", nationalityCountryCode: "GB" },
  { firstName: "Margaret", lastName: "Hamilton", email: "margaret.hamilton@example.com", nationalityCountryCode: "US" },
  { firstName: "Edsger", lastName: "Dijkstra", email: "edsger.dijkstra@example.com", nationalityCountryCode: "NL" },
  { firstName: "Barbara", lastName: "Liskov", email: "barbara.liskov@example.com", nationalityCountryCode: "US" },
  { firstName: "Linus", lastName: "Torvalds", email: "linus.torvalds@example.com", nationalityCountryCode: "FI" },
  { firstName: "Radia", lastName: "Perlman", email: "radia.perlman@example.com", nationalityCountryCode: "US" },
  { firstName: "Donald", lastName: "Knuth", email: "donald.knuth@example.com", nationalityCountryCode: "US" },
  { firstName: "Hedy", lastName: "Lamarr", email: "hedy.lamarr@example.com", nationalityCountryCode: "AT" },
] as const;

/**
 * Reservation seeds relative to "today":
 * [propertyId, guestIndex, arrivalOffset, nights, groupId, roomNumber, status?]
 */
type Seed = [string, number, number, number, string, number, ReservationStatus?];
const SEEDS: Seed[] = [
  // Arriving today (BER)
  ["DEMO-BER", 0, 0, 2, "DBL", 201],
  ["DEMO-BER", 1, 0, 3, "SUI", 301],
  // Departing today (BER)
  ["DEMO-BER", 2, -2, 2, "DBL", 202],
  ["DEMO-BER", 3, -4, 4, "SUI", 302],
  // In-house (BER)
  ["DEMO-BER", 4, -1, 3, "DBL", 203],
  ["DEMO-BER", 5, -2, 5, "SGL", 101],
  // Future (BER)
  ["DEMO-BER", 6, 3, 2, "DBL", 204],
  ["DEMO-BER", 7, 7, 1, "SGL", 102],
  // Checked out (BER)
  ["DEMO-BER", 8, -10, 3, "DBL", 205],
  // Canceled + no-show (BER)
  ["DEMO-BER", 9, 1, 2, "DBL", 206, "canceled"],
  ["DEMO-BER", 10, -1, 2, "SGL", 103, "no_show"],
  // Munich mix
  ["DEMO-MUC", 11, 0, 2, "DBL", 201],
  ["DEMO-MUC", 0, -1, 4, "SUI", 301],
  ["DEMO-MUC", 3, -3, 3, "DBL", 202],
  ["DEMO-MUC", 5, 5, 2, "DBL", 203],
  ["DEMO-MUC", 8, -8, 2, "SGL", 101],
];

const CHANNELS = ["Direct", "Booking.com", "Expedia"];
const NOTES: Record<number, string> = {
  0: "Late arrival expected (~22:00).",
  1: "VIP — welcome amenity in room.",
  4: "Allergic to feather pillows.",
};

export interface DemoData {
  today: IsoDate;
  properties: Property[];
  unitGroups: UnitGroup[];
  unitsByProperty: Record<string, Unit[]>;
  reservations: Reservation[];
}

/** Derive a reservation's status from its dates unless one is pinned. */
function deriveStatus(arrival: IsoDate, departure: IsoDate, today: IsoDate): ReservationStatus {
  if (departure < today) return "checked_out";
  if (arrival > today) return "confirmed";
  if (arrival === today) return "confirmed"; // arriving today, not yet in-house
  return "in_house"; // arrival < today <= departure
}

function buildUnits(): Record<string, Unit[]> {
  const byProperty: Record<string, Unit[]> = {};
  for (const property of PROPERTIES) {
    const units: Unit[] = [];
    for (const group of UNIT_GROUPS) {
      const first = GROUP_FIRST_ROOM[group.id] ?? 100;
      for (let i = 0; i < (group.unitCount ?? 0); i += 1) {
        const room = first + i;
        units.push({
          id: `${property.id}-${room}`,
          name: String(room),
          unitGroupId: group.id,
          unitGroupName: group.name,
          maxPersons: group.maxPersons,
        });
      }
    }
    byProperty[property.id] = units;
  }
  return byProperty;
}

/** Build the full synthetic dataset anchored on `today`. */
export function buildDemoData(today: IsoDate): DemoData {
  const reservations: Reservation[] = SEEDS.map((seed, index): Reservation => {
    const [propertyId, guestIndex, arrivalOffset, nights, groupId, room, pinnedStatus] =
      seed;
    const group = UNIT_GROUPS.find((g) => g.id === groupId)!;
    const guest = GUESTS[guestIndex]!;
    const arrival = addDays(today, arrivalOffset);
    const departure = addDays(arrival, nights);
    const status = pinnedStatus ?? deriveStatus(arrival, departure, today);
    const nightly = GROUP_RATE[groupId] ?? 100;
    const total = nightly * nights;
    const settled = status === "checked_out" || status === "canceled" || status === "no_show";
    const n = index + 1;

    return {
      id: `RES-${n}`,
      propertyId,
      status,
      primaryGuest: { id: `GST-${guestIndex + 1}`, ...guest },
      arrival,
      departure,
      nights,
      adults: group.maxPersons === 1 ? 1 : 2,
      children: 0,
      unitGroupId: group.id,
      unitGroupName: group.name,
      unitId: `${propertyId}-${room}`,
      unitName: String(room),
      ratePlanId: `${groupId}-FLEX`,
      channel: CHANNELS[index % CHANNELS.length],
      totalAmount: { amount: total, currency: CURRENCY },
      balance: { amount: settled ? 0 : total, currency: CURRENCY },
      notes: NOTES[index],
      bookingId: `BKG-${n}`,
      createdAt: `${addDays(arrival, -14)}T10:00:00Z`,
    };
  });

  return {
    today,
    properties: PROPERTIES,
    unitGroups: UNIT_GROUPS,
    unitsByProperty: buildUnits(),
    reservations,
  };
}
