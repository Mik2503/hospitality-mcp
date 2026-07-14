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

## Write operations (not yet validated against a live sandbox)
The write endpoints were implemented from the official Apaleo Booking swagger
but not exercised live, because validating them requires the `reservations.manage`
scope (intentionally not granted yet). Verify against the sandbox once the scope
is granted:
- **create**: `POST /booking/v1/bookings` — confirm the create response exposes
  the new reservation id as `reservationIds[0]` (fallback used otherwise).
- **modify (stay)**: `PUT /booking/v1/reservation-actions/{id}/amend` with
  `requote: true` and one `{ratePlanId}` time-slice per night, reusing the
  current rate plan. Confirm repricing behavior is acceptable.
- **modify (notes)**: `PATCH /booking/v1/reservations/{id}` JSON Patch on
  `/comment`. Confirm the correct field (`comment` vs `guestComment`).
- **cancel**: `PUT /booking/v1/reservation-actions/{id}/cancel` (no body).
  `reason` is currently not sent (no field in the API).
- **childrenAges**: our input carries a children COUNT, not ages; create/modify
  send `DEFAULT_CHILD_AGE` (10) per child. Revisit if ages must be accurate.

## getGuest merge behavior
- Apaleo has no global guest directory, so `getGuest` searches reservations by
  `textSearch` and treats the most recent reservation's guest as canonical.
- TODO: if a search term matches multiple distinct guests, results are mixed.
  Consider grouping by email/name and returning the best match, or surfacing
  that multiple guests matched.

# Mews adapter — open assumptions

The Mews read adapter (`src/mews`) was verified live against the public Mews
demo (`api.mews-demo.com`). Known gaps and assumptions to refine against a real
single-hotel enterprise:

## Not implemented yet
- **getAvailability** and **getOccupancyKPIs** throw `CapabilityNotSupportedError`.
  Mews availability (`services/getAvailability`) needs the accommodation
  `ServiceId`, and occupancy/revenue must be derived from availability +
  accounting/order items. Deferred rather than guessed. Implement against a
  clean enterprise (the shared demo is heavily polluted with test services).

## Occupancy / person counts
- Reservations carry occupancy as `PersonCounts` keyed by `AgeCategoryId`
  (`AdultCount`/`ChildCount` are null). Without the age-category map the adapter
  reports the **total** persons as `adults` and `children: 0`. Refine by loading
  `ageCategories/getAll` for the accommodation service and classifying by age.

## Labels (room type / room number)
- `unitGroupName`/`unitName` are resolved best-effort from `resources/getAll`.
  When categories aren't returned (as in the demo), the category **id** is shown.
  On a real enterprise, resolve names via `resourceCategories/getAll` with the
  accommodation `ServiceId`.

## Guest name search
- `getGuest` by name uses Mews `customers/getAll` `FirstNames`/`LastNames`, which
  are exact matches (not substring). Email/id lookups are exact and reliable.

## Single enterprise
- The Connector API is single-enterprise, so the adapter ignores the
  `propertyId` argument; `list_properties` returns the one enterprise. A default
  placeholder property id (`mews`) lets tool calls omit it.

## Writes
- Not implemented for Mews (read-only adapter). The write path would use the
  Mews reservation/booking operations, gated like Apaleo's.
