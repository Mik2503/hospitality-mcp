import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapAvailability,
  mapProperty,
  mapReservation,
  mapUnitToHousekeeping,
  toApaleoStatus,
  toReservationStatus,
} from "./mappers.js";
import type {
  ApaleoAvailabilityResponse,
  ApaleoProperty,
  ApaleoReservation,
  ApaleoUnit,
} from "./types.js";

// Fixtures below mirror the real shapes observed in the Apaleo sandbox
// (values anonymized).

test("toReservationStatus maps all Apaleo statuses and defaults safely", () => {
  assert.equal(toReservationStatus("Confirmed"), "confirmed");
  assert.equal(toReservationStatus("InHouse"), "in_house");
  assert.equal(toReservationStatus("CheckedOut"), "checked_out");
  assert.equal(toReservationStatus("Canceled"), "canceled");
  assert.equal(toReservationStatus("NoShow"), "no_show");
  // Unrecognized values must map to "unknown", NEVER an active state.
  assert.equal(toReservationStatus("SomethingNew"), "unknown");
  assert.equal(toReservationStatus(undefined), "unknown");
});

test("toApaleoStatus round-trips known statuses", () => {
  assert.equal(toApaleoStatus("in_house"), "InHouse");
  assert.equal(toApaleoStatus("canceled"), "Canceled");
  assert.equal(toApaleoStatus("pending"), undefined);
});

test("mapReservation normalizes a full reservation", () => {
  const raw: ApaleoReservation = {
    id: "ABCDEF-1",
    bookingId: "ABCDEF",
    status: "Confirmed",
    property: { id: "BER", name: "Hotel Berlin" },
    ratePlan: { id: "BER-IBRKF-DBL", code: "IBRKF" },
    unitGroup: { id: "BER-DBL", name: "Double Room", type: "BedRoom" },
    unit: { id: "BER-101", name: "101", unitGroupId: "BER-DBL" },
    totalGrossAmount: { amount: 320, currency: "EUR" },
    balance: { amount: -320, currency: "EUR" },
    arrival: "2026-07-12T10:00:00+02:00",
    departure: "2026-07-14T09:00:00+02:00",
    created: "2026-07-11T11:32:11+02:00",
    adults: 2,
    channelCode: "Direct",
    primaryGuest: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+491234",
      address: { addressLine1: "1 Analytical Ave", city: "Berlin", postalCode: "10117", countryCode: "DE" },
    },
  };

  const r = mapReservation(raw);
  assert.equal(r.id, "ABCDEF-1");
  assert.equal(r.propertyId, "BER");
  assert.equal(r.status, "confirmed");
  assert.equal(r.arrival, "2026-07-12"); // date extracted from local datetime
  assert.equal(r.departure, "2026-07-14");
  assert.equal(r.nights, 2);
  assert.equal(r.adults, 2);
  assert.equal(r.children, 0); // absent -> 0
  assert.equal(r.unitGroupId, "BER-DBL");
  assert.equal(r.unitGroupName, "Double Room");
  assert.equal(r.unitId, "BER-101");
  assert.equal(r.channel, "Direct");
  assert.deepEqual(r.totalAmount, { amount: 320, currency: "EUR" });
  assert.deepEqual(r.balance, { amount: -320, currency: "EUR" });
  assert.equal(r.bookingId, "ABCDEF");
  assert.equal(r.primaryGuest.firstName, "Ada");
  assert.equal(r.primaryGuest.address?.countryCode, "DE");
  assert.equal(r.primaryGuest.id, undefined); // Apaleo has no guest id inline
});

test("mapReservation is tolerant of a sparse reservation", () => {
  const r = mapReservation({ id: "X", arrival: "2026-01-01", departure: "2026-01-01" });
  assert.equal(r.propertyId, "");
  assert.equal(r.status, "unknown");
  assert.equal(r.nights, 0);
  assert.equal(r.adults, 0);
  assert.equal(r.children, 0);
  assert.equal(r.totalAmount, undefined);
  assert.deepEqual(r.primaryGuest, {});
});

test("mapReservation derives children from childrenAges when present", () => {
  const r = mapReservation({
    id: "X",
    arrival: "2026-01-01",
    departure: "2026-01-03",
    childrenAges: [4, 8],
  });
  assert.equal(r.children, 2);
  assert.equal(r.nights, 2);
});

test("mapUnitToHousekeeping maps status and condition", () => {
  const raw: ApaleoUnit = {
    id: "BER-101",
    name: "101",
    status: { isOccupied: true, condition: "Dirty" },
  };
  const hk = mapUnitToHousekeeping(raw);
  assert.deepEqual(hk, { unitId: "BER-101", condition: "dirty", unitName: "101", occupied: true });
});

test("mapUnitToHousekeeping falls back to unknown condition", () => {
  const hk = mapUnitToHousekeeping({ id: "U", status: { condition: "Weird" } });
  assert.equal(hk.condition, "unknown");
});

test("mapAvailability takes the minimum available per unit group across nights", () => {
  const raw: ApaleoAvailabilityResponse = {
    timeSlices: [
      {
        unitGroups: [
          { unitGroup: { id: "BER-SGL", name: "Single" }, availableCount: 50 },
          { unitGroup: { id: "BER-DBL", name: "Double" }, availableCount: 30 },
        ],
      },
      {
        unitGroups: [
          { unitGroup: { id: "BER-SGL", name: "Single" }, availableCount: 42 },
          { unitGroup: { id: "BER-DBL", name: "Double" }, availableCount: 33 },
        ],
      },
    ],
    count: 2,
  };
  const availability = mapAvailability("BER", "2026-07-11", "2026-07-13", raw);
  assert.equal(availability.propertyId, "BER");
  const byId = Object.fromEntries(availability.unitGroups.map((g) => [g.unitGroupId, g.available]));
  assert.equal(byId["BER-SGL"], 42); // min(50, 42)
  assert.equal(byId["BER-DBL"], 30); // min(30, 33)
});

test("mapProperty maps currency, timezone and address", () => {
  const raw: ApaleoProperty = {
    id: "BER",
    code: "BER",
    name: "Hotel Berlin",
    currencyCode: "EUR",
    timeZone: "Europe/Berlin",
    location: { addressLine1: "Friedrichstraße 79-80", city: "Berlin", postalCode: "10117", countryCode: "DE" },
  };
  const p = mapProperty(raw);
  assert.equal(p.id, "BER");
  assert.equal(p.name, "Hotel Berlin");
  assert.equal(p.currencyCode, "EUR");
  assert.equal(p.timeZone, "Europe/Berlin");
  assert.equal(p.address?.city, "Berlin");
  assert.equal(p.address?.countryCode, "DE");
});
