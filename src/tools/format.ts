/**
 * Human-readable formatters for tool output.
 *
 * Tools return normalized domain objects rendered as concise text that reads
 * well inside an AI assistant. (This is the user's own hotel data shown back to
 * them, so guest details are included — unlike logs, which redact secrets.)
 */

import type {
  Availability,
  GuestProfile,
  HousekeepingStatus,
  Money,
  OccupancyKPIs,
  Property,
  Reservation,
} from "../core/index.js";

export function formatMoney(money: Money | undefined): string {
  if (!money) return "—";
  return `${money.amount.toFixed(2)} ${money.currency}`.trim();
}

function guestName(reservation: Reservation): string {
  const { firstName, lastName } = reservation.primaryGuest;
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return name || "(guest name unavailable)";
}

export function formatReservationLine(r: Reservation): string {
  const unit = [r.unitGroupName ?? r.unitGroupId, r.unitName ?? r.unitId]
    .filter(Boolean)
    .join(" / ");
  const occupancy = `${r.adults}a${r.children ? `/${r.children}c` : ""}`;
  const parts = [
    r.id,
    guestName(r),
    `${r.arrival}→${r.departure} (${r.nights}n, ${occupancy})`,
    unit || undefined,
    r.status,
    r.totalAmount ? formatMoney(r.totalAmount) : undefined,
  ].filter(Boolean);
  return `• ${parts.join(" — ")}`;
}

export function formatReservationList(
  reservations: Reservation[],
  emptyMessage: string,
): string {
  if (reservations.length === 0) return emptyMessage;
  const header = `${reservations.length} reservation(s):`;
  return [header, ...reservations.map(formatReservationLine)].join("\n");
}

export function formatReservationDetail(r: Reservation): string {
  const lines = [
    `Reservation ${r.id}${r.bookingId ? ` (booking ${r.bookingId})` : ""}`,
    `  Guest:     ${guestName(r)}${r.primaryGuest.email ? ` <${r.primaryGuest.email}>` : ""}`,
    r.primaryGuest.phone ? `  Phone:     ${r.primaryGuest.phone}` : undefined,
    `  Property:  ${r.propertyId}`,
    `  Stay:      ${r.arrival} → ${r.departure} (${r.nights} night(s))`,
    `  Guests:    ${r.adults} adult(s), ${r.children} child(ren)`,
    `  Room:      ${[r.unitGroupName ?? r.unitGroupId, r.unitName ?? r.unitId].filter(Boolean).join(" / ") || "—"}`,
    `  Status:    ${r.status}`,
    r.channel ? `  Channel:   ${r.channel}` : undefined,
    r.totalAmount ? `  Total:     ${formatMoney(r.totalAmount)}` : undefined,
    r.balance ? `  Balance:   ${formatMoney(r.balance)}` : undefined,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatAvailability(a: Availability): string {
  if (a.unitGroups.length === 0) {
    return `No availability data for ${a.propertyId} (${a.from} → ${a.to}).`;
  }
  const header = `Availability for ${a.propertyId} (${a.from} → ${a.to}), bookable units per room type:`;
  const rows = a.unitGroups.map(
    (g) => `• ${g.unitGroupName ?? g.unitGroupId}: ${g.available}`,
  );
  return [header, ...rows].join("\n");
}

export function formatKPIs(k: OccupancyKPIs): string {
  return [
    `Performance for ${k.propertyId} (${k.from} → ${k.to}):`,
    `  Occupancy:     ${(k.occupancyRate * 100).toFixed(1)}%  (${k.roomsSold}/${k.roomsAvailable} room-nights)`,
    `  ADR:           ${formatMoney(k.adr)}`,
    `  RevPAR:        ${formatMoney(k.revPar)}`,
    `  Room revenue:  ${formatMoney(k.roomRevenue)}`,
    ``,
    `Methodology: ${k.methodology}`,
  ].join("\n");
}

export function formatHousekeeping(
  statuses: HousekeepingStatus[],
  propertyId: string,
): string {
  if (statuses.length === 0) return `No units found for ${propertyId}.`;
  const counts = new Map<string, number>();
  for (const s of statuses) counts.set(s.condition, (counts.get(s.condition) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([condition, n]) => `${n} ${condition}`)
    .join(", ");
  const header = `Housekeeping for ${propertyId} — ${statuses.length} unit(s): ${summary}`;
  const rows = statuses.map((s) => {
    const occ = s.occupied === undefined ? "" : s.occupied ? " (occupied)" : " (vacant)";
    return `• ${s.unitName ?? s.unitId}: ${s.condition}${occ}`;
  });
  return [header, ...rows].join("\n");
}

export function formatGuestProfile(profile: GuestProfile): string {
  const g = profile.guest;
  const name = [g.firstName, g.lastName].filter(Boolean).join(" ") || "(name unavailable)";
  const lines = [
    `Guest: ${name}`,
    g.email ? `  Email:   ${g.email}` : undefined,
    g.phone ? `  Phone:   ${g.phone}` : undefined,
    g.nationalityCountryCode ? `  Country: ${g.nationalityCountryCode}` : undefined,
    ``,
    formatReservationList(profile.reservations, "  No reservations on file."),
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

export function formatProperties(properties: Property[]): string {
  if (properties.length === 0) return "No properties accessible with these credentials.";
  const rows = properties.map((p) => {
    const meta = [p.currencyCode, p.timeZone].filter(Boolean).join(", ");
    return `• ${p.id} — ${p.name}${meta ? ` (${meta})` : ""}`;
  });
  return [`${properties.length} propert(y/ies):`, ...rows].join("\n");
}
