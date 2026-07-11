import { test } from "node:test";
import assert from "node:assert/strict";
import { isWritable } from "./adapter.js";
import type { PMSAdapter, WritablePMSAdapter } from "./adapter.js";
import type { Reservation } from "./domain.js";

// A tiny in-memory adapter proves the read contract is cleanly implementable
// using ONLY normalized types — no PMS-specific leakage.
const sampleReservation: Reservation = {
  id: "res-1",
  propertyId: "DEMO",
  status: "confirmed",
  primaryGuest: { firstName: "Ada", lastName: "Lovelace" },
  arrival: "2026-07-11",
  departure: "2026-07-13",
  nights: 2,
  adults: 1,
  children: 0,
};

const readOnlyAdapter: PMSAdapter = {
  name: "in-memory",
  async listProperties() {
    return [{ id: "DEMO", name: "Demo Hotel" }];
  },
  async getArrivals() {
    return [sampleReservation];
  },
  async getDepartures() {
    return [];
  },
  async searchReservations() {
    return [sampleReservation];
  },
  async getReservation() {
    return sampleReservation;
  },
  async getAvailability(query) {
    return {
      propertyId: query.propertyId,
      from: query.from,
      to: query.to,
      unitGroups: [],
    };
  },
  async getGuest() {
    return { guest: sampleReservation.primaryGuest, reservations: [sampleReservation] };
  },
  async getOccupancyKPIs(query) {
    const zero = { amount: 0, currency: "EUR" };
    return {
      propertyId: query.propertyId,
      from: query.from,
      to: query.to,
      roomsAvailable: 0,
      roomsSold: 0,
      occupancyRate: 0,
      roomRevenue: zero,
      adr: zero,
      revPar: zero,
    };
  },
  async getHousekeeping() {
    return [];
  },
};

test("a read-only adapter is not detected as writable", () => {
  assert.equal(isWritable(readOnlyAdapter), false);
});

test("a full adapter with write methods is detected as writable", () => {
  const writableAdapter: WritablePMSAdapter = {
    ...readOnlyAdapter,
    async createReservation() {
      return sampleReservation;
    },
    async modifyReservation() {
      return sampleReservation;
    },
    async cancelReservation() {
      return { ...sampleReservation, status: "canceled" };
    },
  };

  assert.equal(isWritable(writableAdapter), true);

  // The guard narrows the type, so write methods are callable here.
  if (isWritable(writableAdapter)) {
    assert.equal(typeof writableAdapter.cancelReservation, "function");
  }
});
