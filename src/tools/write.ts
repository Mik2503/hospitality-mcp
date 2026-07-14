/**
 * Registers the WRITE tools (create / modify / cancel reservation).
 *
 * These are only registered when writes are explicitly enabled
 * (APALEO_ENABLE_WRITES=true) AND the adapter supports writes. On top of that,
 * every write tool is guarded by a two-step confirmation:
 *
 *   1. Called without `confirm: true`, the tool returns a PREVIEW of exactly
 *      what would happen and makes NO changes.
 *   2. Only when called with `confirm: true` does it execute the change.
 *
 * This defense-in-depth means writes can never happen by accident.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { WritablePMSAdapter } from "../core/index.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { formatMoney, formatReservationDetail } from "./format.js";
import { errorResult, resolvePropertyFactory, run, text } from "./shared.js";

const PREVIEW_FOOTER =
  "\n\n⚠️  PREVIEW ONLY — no changes were made. " +
  "Re-run the same call with `confirm: true` to execute.";

/**
 * Return a preview (no side effects) unless `confirm` is true, in which case run
 * `execute` and return its result text.
 */
async function previewOrExecute(
  confirm: boolean | undefined,
  buildPreview: () => Promise<string>,
  execute: () => Promise<string>,
): Promise<CallToolResult> {
  const preview = await buildPreview();
  if (confirm !== true) {
    return text(preview + PREVIEW_FOOTER);
  }
  return text(await execute());
}

export function registerWriteTools(
  server: McpServer,
  adapter: WritablePMSAdapter,
  config: AppConfig,
  logger: Logger,
): void {
  const resolveProperty = resolvePropertyFactory(config.defaultPropertyId);
  const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
  // Write tools are not read-only and are potentially destructive.
  const writeHint = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;
  const confirmField = z
    .boolean()
    .optional()
    .describe("Must be true to actually execute. Omit/false to preview only.");

  server.registerTool(
    "create_reservation",
    {
      title: "Create reservation",
      description:
        "Create a new reservation. Without `confirm: true` this only previews " +
        "what would be created. Requires a ratePlanId (see get_availability).",
      inputSchema: {
        propertyId: z.string().optional().describe("Property id (defaults to config)"),
        arrival: dateField.describe("Check-in date YYYY-MM-DD"),
        departure: dateField.describe("Check-out date YYYY-MM-DD"),
        ratePlanId: z.string().min(1).describe("Rate plan id (required by Apaleo)"),
        adults: z.number().int().positive().describe("Number of adults"),
        children: z.number().int().nonnegative().optional().describe("Number of children"),
        guestFirstName: z.string().min(1).describe("Primary guest first name"),
        guestLastName: z.string().min(1).describe("Primary guest last name"),
        guestEmail: z.string().email().optional().describe("Primary guest email"),
        guestPhone: z.string().optional().describe("Primary guest phone"),
        notes: z.string().optional().describe("Optional reservation comment"),
        confirm: confirmField,
      },
      annotations: writeHint,
    },
    (args) =>
      run(async () => {
        const propertyId = resolveProperty(args.propertyId);
        const input = {
          propertyId,
          arrival: args.arrival,
          departure: args.departure,
          unitGroupId: "",
          ratePlanId: args.ratePlanId,
          adults: args.adults,
          ...(args.children !== undefined ? { children: args.children } : {}),
          guest: {
            firstName: args.guestFirstName,
            lastName: args.guestLastName,
            ...(args.guestEmail ? { email: args.guestEmail } : {}),
            ...(args.guestPhone ? { phone: args.guestPhone } : {}),
          },
          ...(args.notes ? { notes: args.notes } : {}),
        };

        return previewOrExecute(
          args.confirm,
          async () =>
            [
              "About to CREATE a reservation:",
              `  Property:  ${propertyId}`,
              `  Rate plan: ${args.ratePlanId}`,
              `  Stay:      ${args.arrival} → ${args.departure}`,
              `  Guests:    ${args.adults} adult(s)${args.children ? `, ${args.children} child(ren)` : ""}`,
              `  Guest:     ${args.guestFirstName} ${args.guestLastName}` +
                (args.guestEmail ? ` <${args.guestEmail}>` : ""),
              args.notes ? `  Notes:     ${args.notes}` : undefined,
            ]
              .filter(Boolean)
              .join("\n"),
          async () => {
            const created = await adapter.createReservation(input);
            return `✅ Reservation created.\n\n${formatReservationDetail(created)}`;
          },
        );
      }),
  );

  server.registerTool(
    "modify_reservation",
    {
      title: "Modify reservation",
      description:
        "Change a reservation's stay dates, occupancy, and/or notes. Without " +
        "`confirm: true` this previews the change (showing before → after) only.",
      inputSchema: {
        reservationId: z.string().min(1).describe("Reservation id to modify"),
        arrival: dateField.optional().describe("New check-in date"),
        departure: dateField.optional().describe("New check-out date"),
        adults: z.number().int().positive().optional().describe("New number of adults"),
        children: z.number().int().nonnegative().optional().describe("New number of children"),
        notes: z.string().optional().describe("New reservation comment"),
        confirm: confirmField,
      },
      annotations: writeHint,
    },
    (args) =>
      run(async () => {
        const hasChange =
          args.arrival !== undefined ||
          args.departure !== undefined ||
          args.adults !== undefined ||
          args.children !== undefined ||
          args.notes !== undefined;
        if (!hasChange) {
          return errorResult(
            "Nothing to change. Provide at least one of arrival, departure, adults, children, notes.",
          );
        }

        const input = {
          reservationId: args.reservationId,
          ...(args.arrival !== undefined ? { arrival: args.arrival } : {}),
          ...(args.departure !== undefined ? { departure: args.departure } : {}),
          ...(args.adults !== undefined ? { adults: args.adults } : {}),
          ...(args.children !== undefined ? { children: args.children } : {}),
          ...(args.notes !== undefined ? { notes: args.notes } : {}),
        };

        return previewOrExecute(
          args.confirm,
          async () => {
            const current = await adapter.getReservation(args.reservationId);
            const change = (label: string, from: unknown, to: unknown) =>
              to === undefined ? undefined : `  ${label}: ${from} → ${to}`;
            return [
              `About to MODIFY reservation ${args.reservationId}:`,
              change("Arrival", current.arrival, args.arrival),
              change("Departure", current.departure, args.departure),
              change("Adults", current.adults, args.adults),
              change("Children", current.children, args.children),
              args.notes !== undefined ? `  Notes → ${args.notes}` : undefined,
            ]
              .filter(Boolean)
              .join("\n");
          },
          async () => {
            const updated = await adapter.modifyReservation(input);
            return `✅ Reservation modified.\n\n${formatReservationDetail(updated)}`;
          },
        );
      }),
  );

  server.registerTool(
    "cancel_reservation",
    {
      title: "Cancel reservation",
      description:
        "Cancel a reservation. Without `confirm: true` this previews what would " +
        "be canceled only. Cancellation may not be reversible.",
      inputSchema: {
        reservationId: z.string().min(1).describe("Reservation id to cancel"),
        reason: z.string().optional().describe("Optional reason (for your reference)"),
        confirm: confirmField,
      },
      annotations: writeHint,
    },
    (args) =>
      run(async () =>
        previewOrExecute(
          args.confirm,
          async () => {
            const current = await adapter.getReservation(args.reservationId);
            const guest = [current.primaryGuest.firstName, current.primaryGuest.lastName]
              .filter(Boolean)
              .join(" ");
            return [
              `About to CANCEL reservation ${args.reservationId}:`,
              `  Guest:  ${guest || "(unknown)"}`,
              `  Stay:   ${current.arrival} → ${current.departure}`,
              `  Status: ${current.status}`,
              current.totalAmount ? `  Total:  ${formatMoney(current.totalAmount)}` : undefined,
              `  This may not be reversible.`,
            ]
              .filter(Boolean)
              .join("\n");
          },
          async () => {
            const canceled = await adapter.cancelReservation({
              reservationId: args.reservationId,
              ...(args.reason ? { reason: args.reason } : {}),
            });
            return `✅ Reservation canceled.\n\n${formatReservationDetail(canceled)}`;
          },
        ),
      ),
  );

  logger.warn(
    "WRITE MODE ENABLED: create/modify/cancel tools are registered. " +
      "Each requires confirm:true after a preview.",
  );
}
