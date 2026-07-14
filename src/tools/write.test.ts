import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { Reservation, WritablePMSAdapter } from "../core/index.js";

const silentLogger: Logger = { error() {}, warn() {}, info() {}, debug() {} };

const sampleReservation: Reservation = {
  id: "RES-1",
  propertyId: "BER",
  status: "confirmed",
  primaryGuest: { firstName: "Ada", lastName: "Lovelace" },
  arrival: "2026-07-12",
  departure: "2026-07-14",
  nights: 2,
  adults: 2,
  children: 0,
  totalAmount: { amount: 200, currency: "EUR" },
};

/** A mock writable adapter that records which write methods were invoked. */
function makeMockAdapter() {
  const calls = { create: 0, modify: 0, cancel: 0 };
  const adapter: WritablePMSAdapter = {
    name: "mock",
    async listProperties() {
      return [{ id: "BER", name: "Hotel Berlin" }];
    },
    async getArrivals() {
      return [];
    },
    async getDepartures() {
      return [];
    },
    async searchReservations() {
      return [];
    },
    async getReservation() {
      return sampleReservation;
    },
    async getAvailability(q) {
      return { propertyId: q.propertyId, from: q.from, to: q.to, unitGroups: [] };
    },
    async getGuest() {
      return { guest: sampleReservation.primaryGuest, reservations: [sampleReservation] };
    },
    async getOccupancyKPIs(q) {
      const zero = { amount: 0, currency: "EUR" };
      return {
        propertyId: q.propertyId,
        from: q.from,
        to: q.to,
        roomsAvailable: 0,
        roomsSold: 0,
        occupancyRate: 0,
        roomRevenue: zero,
        adr: zero,
        revPar: zero,
        methodology: "mock",
      };
    },
    async getHousekeeping() {
      return [];
    },
    async createReservation() {
      calls.create += 1;
      return { ...sampleReservation, id: "RES-NEW" };
    },
    async modifyReservation() {
      calls.modify += 1;
      return { ...sampleReservation, adults: 3 };
    },
    async cancelReservation() {
      calls.cancel += 1;
      return { ...sampleReservation, status: "canceled" };
    },
  };
  return { adapter, calls };
}

function makeConfig(enableWrites: boolean): AppConfig {
  return {
    provider: "apaleo",
    enableWrites,
    defaultPropertyId: "BER",
    apaleo: {
      clientId: "id",
      clientSecret: "secret",
      enableWrites,
      defaultPropertyId: "BER",
      tokenUrl: "https://identity.apaleo.test/connect/token",
      apiBaseUrl: "https://api.apaleo.test",
    },
    logLevel: "error",
  };
}

async function connectClient(adapter: WritablePMSAdapter, config: AppConfig) {
  const server = createServer(adapter, config, silentLogger);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).map((c) => c.text ?? "").join("\n");
}

test("write tools are NOT registered when writes are disabled", async () => {
  const { adapter } = makeMockAdapter();
  const client = await connectClient(adapter, makeConfig(false));
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(!names.includes("create_reservation"));
  assert.ok(!names.includes("modify_reservation"));
  assert.ok(!names.includes("cancel_reservation"));
  assert.equal(tools.length, 9);
  await client.close();
});

test("write tools ARE registered when writes are enabled", async () => {
  const { adapter } = makeMockAdapter();
  const client = await connectClient(adapter, makeConfig(true));
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ["create_reservation", "modify_reservation", "cancel_reservation"]) {
    assert.ok(names.includes(n), `expected ${n} to be registered`);
  }
  await client.close();
});

test("create_reservation without confirm previews and does NOT execute", async () => {
  const { adapter, calls } = makeMockAdapter();
  const client = await connectClient(adapter, makeConfig(true));
  const result = await client.callTool({
    name: "create_reservation",
    arguments: {
      arrival: "2026-08-01",
      departure: "2026-08-03",
      ratePlanId: "BER-NONREF-DBL",
      adults: 2,
      guestFirstName: "Grace",
      guestLastName: "Hopper",
    },
  });
  const body = textOf(result as never);
  assert.match(body, /PREVIEW ONLY/);
  assert.match(body, /About to CREATE/);
  assert.equal(calls.create, 0, "must not create without confirm");
  await client.close();
});

test("create_reservation with confirm:true executes exactly once", async () => {
  const { adapter, calls } = makeMockAdapter();
  const client = await connectClient(adapter, makeConfig(true));
  const result = await client.callTool({
    name: "create_reservation",
    arguments: {
      arrival: "2026-08-01",
      departure: "2026-08-03",
      ratePlanId: "BER-NONREF-DBL",
      adults: 2,
      guestFirstName: "Grace",
      guestLastName: "Hopper",
      confirm: true,
    },
  });
  const body = textOf(result as never);
  assert.match(body, /created/i);
  assert.doesNotMatch(body, /PREVIEW ONLY/);
  assert.equal(calls.create, 1);
  await client.close();
});

test("cancel_reservation gating: preview then execute", async () => {
  const { adapter, calls } = makeMockAdapter();
  const client = await connectClient(adapter, makeConfig(true));

  const preview = await client.callTool({
    name: "cancel_reservation",
    arguments: { reservationId: "RES-1" },
  });
  assert.match(textOf(preview as never), /PREVIEW ONLY/);
  assert.equal(calls.cancel, 0);

  const done = await client.callTool({
    name: "cancel_reservation",
    arguments: { reservationId: "RES-1", confirm: true },
  });
  assert.match(textOf(done as never), /canceled/i);
  assert.equal(calls.cancel, 1);
  await client.close();
});

test("modify_reservation gating: preview shows before→after, then executes", async () => {
  const { adapter, calls } = makeMockAdapter();
  const client = await connectClient(adapter, makeConfig(true));

  const preview = await client.callTool({
    name: "modify_reservation",
    arguments: { reservationId: "RES-1", adults: 3 },
  });
  const previewBody = textOf(preview as never);
  assert.match(previewBody, /PREVIEW ONLY/);
  assert.match(previewBody, /Adults: 2 → 3/);
  assert.equal(calls.modify, 0);

  const done = await client.callTool({
    name: "modify_reservation",
    arguments: { reservationId: "RES-1", adults: 3, confirm: true },
  });
  assert.match(textOf(done as never), /modified/i);
  assert.equal(calls.modify, 1);
  await client.close();
});
