import { test } from "node:test";
import assert from "node:assert/strict";
import { MewsAdapter } from "./adapter.js";
import { toReservationStatus, toHousekeepingCondition, localDate } from "./mappers.js";
import { CapabilityNotSupportedError, isWritable } from "../core/index.js";
import type { Logger } from "../logger.js";
import type { MewsClient } from "./client.js";

const noopLogger: Logger = { error() {}, warn() {}, info() {}, debug() {} };

const ENTERPRISE = {
  Id: "ENT1",
  Name: "Test Hotel",
  TimeZoneIdentifier: "Europe/Berlin",
  Currencies: [{ Currency: "EUR", IsDefault: true }],
  Address: { Line1: "Main St 1", City: "Berlin", CountryCode: "DE" },
};

const RESERVATIONS = [
  { Id: "R1", State: "Confirmed", StartUtc: "2026-06-15T14:00:00Z", EndUtc: "2026-06-17T10:00:00Z", AccountId: "C1", RequestedResourceCategoryId: "cat1", AssignedResourceId: "r1", PersonCounts: [{ Count: 2 }] },
  { Id: "R2", State: "Canceled", StartUtc: "2026-06-15T14:00:00Z", EndUtc: "2026-06-16T10:00:00Z", AccountId: "C2", PersonCounts: [{ Count: 1 }] },
  { Id: "R3", State: "Started", StartUtc: "2026-06-10T14:00:00Z", EndUtc: "2026-06-15T10:00:00Z", AccountId: "C1", AssignedResourceId: "r2", PersonCounts: [{ Count: 2 }] },
];

const CUSTOMERS: Record<string, { Id: string; FirstName: string; LastName: string; Email?: string }> = {
  C1: { Id: "C1", FirstName: "Ada", LastName: "Lovelace", Email: "ada@example.com" },
  C2: { Id: "C2", FirstName: "Bob", LastName: "Zeta" },
};

const RESOURCES = {
  Resources: [
    { Id: "r1", Name: "101", State: "Clean", IsActive: true },
    { Id: "r2", Name: "102", State: "Dirty", IsActive: true },
    { Id: "r3", Name: "old", State: "Clean", IsActive: false },
  ],
  ResourceCategories: [{ Id: "cat1", Names: { "en-US": "Double" } }],
};

// Minimal fake MewsClient that answers the operations the adapter calls.
function makeAdapter(): MewsAdapter {
  const client = {
    async post(op: string, body: Record<string, unknown> = {}) {
      if (op === "configuration/get") return { Enterprise: ENTERPRISE };
      if (op === "resources/getAll") return RESOURCES;
      if (op === "customers/getAll") {
        const ids = (body.CustomerIds as string[] | undefined) ?? [];
        const emails = (body.Emails as string[] | undefined) ?? [];
        let list = Object.values(CUSTOMERS);
        if (ids.length) list = list.filter((c) => ids.includes(c.Id));
        if (emails.length) list = list.filter((c) => c.Email && emails.includes(c.Email));
        return { Customers: list };
      }
      if (op.startsWith("reservations/getAll")) {
        let list = RESERVATIONS;
        if (body.ReservationIds) list = list.filter((r) => (body.ReservationIds as string[]).includes(r.Id));
        if (body.CustomerIds) list = list.filter((r) => (body.CustomerIds as string[]).includes(r.AccountId));
        return { Reservations: list };
      }
      throw new Error(`unexpected op ${op}`);
    },
  } as unknown as MewsClient;
  return new MewsAdapter(client, noopLogger);
}

test("state and condition mapping", () => {
  assert.equal(toReservationStatus("Started"), "in_house");
  assert.equal(toReservationStatus("Processed"), "checked_out");
  assert.equal(toReservationStatus("Canceled"), "canceled");
  assert.equal(toReservationStatus("Something"), "unknown");
  assert.equal(toHousekeepingCondition("Clean"), "clean");
  assert.equal(toHousekeepingCondition("OutOfOrder"), "unknown");
});

test("localDate converts a UTC instant to the enterprise-local calendar date", () => {
  assert.equal(localDate("2026-06-15T23:30:00Z", "Europe/Berlin"), "2026-06-16"); // +2 crosses midnight
  assert.equal(localDate("2026-06-15T09:00:00Z", "Europe/Berlin"), "2026-06-15");
});

test("mews adapter is read-only", () => {
  assert.equal(isWritable(makeAdapter()), false);
});

test("listProperties maps the enterprise to one property", async () => {
  const props = await makeAdapter().listProperties();
  assert.equal(props.length, 1);
  assert.equal(props[0]?.id, "ENT1");
  assert.equal(props[0]?.currencyCode, "EUR");
  assert.equal(props[0]?.timeZone, "Europe/Berlin");
});

test("getArrivals returns the day's non-canceled arrivals with resolved guest + labels", async () => {
  const arrivals = await makeAdapter().getArrivals({ propertyId: "ENT1", date: "2026-06-15" });
  assert.equal(arrivals.length, 1); // R1 only (R2 canceled, R3 arrives 06-10)
  const r = arrivals[0]!;
  assert.equal(r.id, "R1");
  assert.equal(r.primaryGuest.lastName, "Lovelace");
  assert.equal(r.unitGroupName, "Double");
  assert.equal(r.unitName, "101");
  assert.equal(r.status, "confirmed");
});

test("getDepartures returns the day's departures", async () => {
  const deps = await makeAdapter().getDepartures({ propertyId: "ENT1", date: "2026-06-15" });
  assert.deepEqual(deps.map((r) => r.id), ["R3"]);
});

test("getReservation returns by id, or throws NotFound", async () => {
  const a = makeAdapter();
  assert.equal((await a.getReservation("R1")).id, "R1");
  await assert.rejects(() => a.getReservation("nope"), /not found/i);
});

test("getGuest resolves a customer and their history", async () => {
  const profile = await makeAdapter().getGuest({ email: "ada@example.com" });
  assert.equal(profile.guest.lastName, "Lovelace");
  assert.deepEqual(new Set(profile.reservations.map((r) => r.id)), new Set(["R1", "R3"]));
});

test("getHousekeeping maps states and skips inactive resources", async () => {
  const hk = await makeAdapter().getHousekeeping({ propertyId: "ENT1" });
  assert.equal(hk.length, 2); // r3 inactive excluded
  assert.deepEqual(
    hk.map((u) => [u.unitName, u.condition]),
    [["101", "clean"], ["102", "dirty"]],
  );
});

test("availability and occupancy KPIs are not supported yet", async () => {
  const a = makeAdapter();
  await assert.rejects(() => a.getAvailability({ propertyId: "ENT1", from: "2026-06-15", to: "2026-06-16" }), CapabilityNotSupportedError);
  await assert.rejects(() => a.getOccupancyKPIs({ propertyId: "ENT1", from: "2026-06-15", to: "2026-06-16" }), CapabilityNotSupportedError);
});
