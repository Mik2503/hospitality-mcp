import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoAdapter } from "./adapter.js";
import { isWritable } from "../core/index.js";
import type { Logger } from "../logger.js";

const noopLogger: Logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

// Fixed "today" so the synthetic, date-anchored data is deterministic.
const TODAY = "2026-06-15";
const BER = "DEMO-BER";
const make = () => new DemoAdapter(noopLogger, { today: TODAY });

test("is read-only (not writable) so write tools never register", () => {
  assert.equal(isWritable(make()), false);
});

test("lists both demo properties, clearly marked as sample data", async () => {
  const props = await make().listProperties();
  assert.equal(props.length, 2);
  assert.ok(props.every((p) => /SAMPLE DATA/.test(p.name)));
});

test("getArrivals returns today's arrivals, excluding canceled/no-show, sorted by last name", async () => {
  const arrivals = await make().getArrivals({ propertyId: BER, date: TODAY });
  const names = arrivals.map((r) => r.primaryGuest.lastName);
  assert.deepEqual(names, ["Lovelace", "Turing"]);
  assert.ok(arrivals.every((r) => r.arrival === TODAY));
  assert.ok(arrivals.every((r) => r.status !== "canceled" && r.status !== "no_show"));
});

test("getDepartures returns today's departures", async () => {
  const departures = await make().getDepartures({ propertyId: BER, date: TODAY });
  assert.ok(departures.length >= 1);
  assert.ok(departures.every((r) => r.departure === TODAY));
});

test("searchReservations matches by guest name (across properties)", async () => {
  const found = await make().searchReservations({ guestName: "lovelace" });
  assert.ok(found.length >= 1);
  assert.ok(found.every((r) => /lovelace/i.test(r.primaryGuest.lastName ?? "")));
});

test("searchReservations respects the status filter", async () => {
  const canceled = await make().searchReservations({ status: ["canceled"] });
  assert.ok(canceled.length >= 1);
  assert.ok(canceled.every((r) => r.status === "canceled"));
});

test("getReservation returns one by id, or throws NotFoundError", async () => {
  const adapter = make();
  const r = await adapter.getReservation("RES-1");
  assert.equal(r.id, "RES-1");
  await assert.rejects(() => adapter.getReservation("RES-does-not-exist"), /not found/i);
});

test("getGuest finds a guest by email and returns their history", async () => {
  const profile = await make().getGuest({ email: "ada.lovelace@example.com" });
  assert.equal(profile.guest.lastName, "Lovelace");
  assert.ok(profile.reservations.length >= 1);
});

test("getAvailability never exceeds a unit group's inventory", async () => {
  const availability = await make().getAvailability({
    propertyId: BER,
    from: TODAY,
    to: "2026-06-18",
  });
  assert.ok(availability.unitGroups.length >= 1);
  assert.ok(availability.unitGroups.every((g) => g.available >= 0));
});

test("getOccupancyKPIs returns coherent, bounded figures with a demo methodology", async () => {
  const kpis = await make().getOccupancyKPIs({
    propertyId: BER,
    from: TODAY,
    to: "2026-06-22",
  });
  assert.ok(kpis.roomsAvailable > 0);
  assert.ok(kpis.roomsSold >= 0 && kpis.roomsSold <= kpis.roomsAvailable);
  assert.ok(kpis.occupancyRate >= 0 && kpis.occupancyRate <= 1);
  assert.match(kpis.methodology, /SYNTHETIC DEMO DATA/);
});

test("getHousekeeping returns a status per unit, some occupied", async () => {
  const housekeeping = await make().getHousekeeping({ propertyId: BER });
  assert.equal(housekeeping.length, 35); // 10 SGL + 20 DBL + 5 SUI
  assert.ok(housekeeping.some((u) => u.occupied === true));
});
