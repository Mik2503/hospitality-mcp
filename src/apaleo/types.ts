/**
 * Raw Apaleo API response shapes — the ONLY place Apaleo-specific types live.
 *
 * These are intentionally partial and permissive (almost everything optional):
 * we read just the fields we map, and stay tolerant of missing/extra fields so
 * a minor API change doesn't crash the adapter. Nothing here is exported beyond
 * the Apaleo adapter — the normalized `core` types are the public vocabulary.
 *
 * Field names and structures verified live against the Apaleo sandbox.
 */

export interface ApaleoAmount {
  amount?: number;
  currency?: string;
}

export interface ApaleoAddress {
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
}

export interface ApaleoProperty {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  location?: ApaleoAddress;
  timeZone?: string;
  currencyCode?: string;
  isArchived?: boolean;
}

export interface ApaleoPropertiesResponse {
  properties?: ApaleoProperty[];
  count?: number;
}

export interface ApaleoUnitGroupRef {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  type?: string;
}

export interface ApaleoUnitStatus {
  isOccupied?: boolean;
  /** Apaleo housekeeping condition: "Clean" | "Dirty" | "CleaningInProgress" | ... */
  condition?: string;
}

export interface ApaleoUnit {
  id?: string;
  name?: string;
  description?: string;
  property?: { id?: string };
  unitGroup?: { id?: string };
  status?: ApaleoUnitStatus;
  maxPersons?: number;
  isArchived?: boolean;
}

export interface ApaleoUnitsResponse {
  units?: ApaleoUnit[];
  count?: number;
}

export interface ApaleoUnitGroup {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  memberCount?: number;
  maxPersons?: number;
  type?: string;
}

export interface ApaleoUnitGroupsResponse {
  unitGroups?: ApaleoUnitGroup[];
  count?: number;
}

export interface ApaleoGuest {
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  nationalityCountryCode?: string;
  address?: ApaleoAddress;
}

export interface ApaleoTimeSliceAmount {
  grossAmount?: number;
  netAmount?: number;
  currency?: string;
}

export interface ApaleoTimeSlice {
  from?: string;
  to?: string;
  serviceDate?: string;
  baseAmount?: ApaleoTimeSliceAmount;
  totalGrossAmount?: ApaleoAmount;
}

export interface ApaleoReservation {
  id?: string;
  bookingId?: string;
  status?: string;
  property?: ApaleoProperty;
  ratePlan?: { id?: string; code?: string; name?: string };
  unitGroup?: ApaleoUnitGroupRef;
  unit?: { id?: string; name?: string; unitGroupId?: string };
  totalGrossAmount?: ApaleoAmount;
  balance?: ApaleoAmount;
  arrival?: string;
  departure?: string;
  created?: string;
  modified?: string;
  adults?: number;
  children?: number;
  childrenAges?: number[];
  channelCode?: string;
  primaryGuest?: ApaleoGuest;
  timeSlices?: ApaleoTimeSlice[];
}

export interface ApaleoReservationsResponse {
  reservations?: ApaleoReservation[];
  count?: number;
}

export interface ApaleoAvailabilityUnitGroup {
  unitGroup?: ApaleoUnitGroupRef;
  physicalCount?: number;
  houseCount?: number;
  soldCount?: number;
  availableCount?: number;
  sellableCount?: number;
}

export interface ApaleoAvailabilityPropertyCounts {
  physicalCount?: number;
  houseCount?: number;
  soldCount?: number;
  sellableCount?: number;
}

export interface ApaleoAvailabilityTimeSlice {
  from?: string;
  to?: string;
  property?: ApaleoAvailabilityPropertyCounts;
  unitGroups?: ApaleoAvailabilityUnitGroup[];
}

export interface ApaleoAvailabilityResponse {
  timeSlices?: ApaleoAvailabilityTimeSlice[];
  count?: number;
}
