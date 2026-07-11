# Add a PMS adapter

This project is built so that supporting a new PMS (Mews, Cloudbeds, your own,
…) means writing **one adapter** — no changes to the MCP tools or the server.
This guide walks through it. The Apaleo adapter in [`src/apaleo/`](../src/apaleo)
is your reference implementation.

## The big picture

```
MCP tools  ─►  PMSAdapter (normalized interface)  ─►  your adapter  ─►  PMS API
                    ▲
            normalized domain types (core/)
```

Tools only ever call the **normalized interface**, using **normalized domain
types**. Your adapter's job is to translate between the PMS's API and those
neutral types. Provider-specific shapes must **never** leak out of your adapter.

## 1. Implement the interface

Create `src/<pms>/adapter.ts` with a class implementing
[`PMSAdapter`](../src/core/adapter.ts) (reads). Writes are optional: implement
[`WritablePMSAdapter`](../src/core/adapter.ts) only if your PMS supports them.

```ts
import type {
  PMSAdapter, Property, Reservation, Availability,
  GuestProfile, OccupancyKPIs, HousekeepingStatus,
  ArrivalsQuery, ReservationSearchQuery, AvailabilityQuery,
  GuestLookup, OccupancyQuery, HousekeepingQuery,
} from "../core/index.js";

export class MyPmsAdapter implements PMSAdapter {
  readonly name = "mypms";

  async listProperties(): Promise<Property[]> { /* … */ }
  async getArrivals(q: ArrivalsQuery): Promise<Reservation[]> { /* … */ }
  async getDepartures(q: ArrivalsQuery): Promise<Reservation[]> { /* … */ }
  async searchReservations(q: ReservationSearchQuery): Promise<Reservation[]> { /* … */ }
  async getReservation(id: string): Promise<Reservation> { /* … */ }
  async getAvailability(q: AvailabilityQuery): Promise<Availability> { /* … */ }
  async getGuest(l: GuestLookup): Promise<GuestProfile> { /* … */ }
  async getOccupancyKPIs(q: OccupancyQuery): Promise<OccupancyKPIs> { /* … */ }
  async getHousekeeping(q: HousekeepingQuery): Promise<HousekeepingStatus[]> { /* … */ }
}
```

## 2. Keep provider types isolated

Mirror the Apaleo layout:

- `src/<pms>/types.ts` — raw response shapes from your PMS. Keep them **partial
  and permissive** (fields optional) so a minor API change doesn't crash you.
- `src/<pms>/mappers.ts` — **pure** functions mapping raw → normalized types.
  This is the only code that "knows" both sides.
- `src/<pms>/adapter.ts` — orchestrates HTTP calls + mappers.

Nothing from `types.ts` should appear in a method's return type. The `core/`
types are the public vocabulary.

## 3. Follow the conventions

- **Dates**: normalized dates are `YYYY-MM-DD` (local calendar date). Times use
  ISO 8601. Convert as needed.
- **Money**: `{ amount, currency }` with an ISO 4217 code.
- **Status**: map your PMS's reservation statuses onto the normalized
  `ReservationStatus` union. If you get a value you don't recognize, map it to
  `"unknown"` — **never** guess an active state — and log it.
- **Not found**: throw `NotFoundError(resource, id)` from `core/`.
- **Unsupported capability**: if your PMS has no housekeeping API (etc.), throw
  `CapabilityNotSupportedError(capability, name)` rather than inventing data.
- **Derived KPIs**: if there's no metrics endpoint, derive them and set the
  `methodology` string so consumers know exactly what's being measured.
- **Secrets**: read credentials from env only; never log tokens/secrets.

## 4. Wire it up

Today the server constructs the Apaleo adapter in
[`src/apaleo/factory.ts`](../src/apaleo/factory.ts) and passes it to
[`createServer`](../src/server.ts). To add a PMS, construct your adapter the
same way and hand it to `createServer`. A natural next step (PRs welcome) is a
`PMS_PROVIDER` env var selecting which adapter to build — the server and tools
need no changes because they only depend on `PMSAdapter`.

## 5. Test it

- **Unit-test your mappers** against fixtures shaped like real API responses
  (see [`src/apaleo/mappers.test.ts`](../src/apaleo/mappers.test.ts)).
- **Prove the contract compiles** by implementing it end-to-end; the type
  checker enforces the shape.
- If you add writes, cover the gating with an in-memory MCP client like
  [`src/tools/write.test.ts`](../src/tools/write.test.ts).

That's it — open a PR. Each new adapter makes the project more useful to more
hoteliers. 🙌
