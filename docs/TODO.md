# Adapter TODO / open assumptions

Tracking assumptions in the Apaleo adapter that were reasonable but not fully
verifiable against the sandbox sample data (which is uniform: all reservations
`Confirmed`, all units `Clean`, no out-of-order rooms). Refine these against a
richer real account. None block current functionality.

## Reservation status set
- Verified live: `Confirmed`. Mapped by convention: `InHouse`, `CheckedOut`,
  `Canceled`, `NoShow`. Any unrecognized value now maps to **`unknown`** (never
  an active state) and is logged. See `mappers.ts:toReservationStatus`.
- TODO: confirm the full set Apaleo emits (e.g. is there a `Tentative`?).

## Housekeeping condition strings
- Verified live: `Clean`. Mapped by convention: `Dirty`, `CleaningInProgress`,
  `Inspected`. Unknown → `unknown`. See `mappers.ts:APALEO_TO_CONDITION`.
- TODO: confirm exact strings, especially whether `Inspected` exists.

## Children count field
- Sandbox reservations have no children field. Adapter reads `children`, then
  falls back to `childrenAges.length`, else `0`. See `mappers.ts:mapReservation`.
- TODO: confirm the real field name/shape for children on a reservation.

## Occupancy denominator (out-of-order rooms)
- `roomsAvailable` uses each bedroom unit group's `physicalCount`. Sandbox has 0
  out-of-order rooms, so physical == sellable there.
- TODO: decide whether out-of-order/out-of-service rooms should reduce
  `roomsAvailable` (would switch to `sellableCount`/`houseCount`).

## KPI revenue basis
- Currently: **booked** room revenue, **net of VAT**, room-only, bedrooms only,
  excluding canceled/no-show, over `[from, to)`. Declared in the returned
  `methodology` string.
- TODO: optionally offer a **realized** (folio-based) revenue mode. That would
  require the `folios.read` scope (intentionally not requested today).

## getGuest merge behavior
- Apaleo has no global guest directory, so `getGuest` searches reservations by
  `textSearch` and treats the most recent reservation's guest as canonical.
- TODO: if a search term matches multiple distinct guests, results are mixed.
  Consider grouping by email/name and returning the best match, or surfacing
  that multiple guests matched.
