/**
 * Registers the read-only MCP tools on a server.
 *
 * Every tool validates its input with zod, calls the PMS through the normalized
 * {@link PMSAdapter} interface (never Apaleo directly), and returns readable
 * text. Errors are turned into clear, non-leaking messages.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PMSAdapter } from "../core/index.js";
import {
  CapabilityNotSupportedError,
  NotFoundError,
} from "../core/index.js";
import { ApaleoApiError, ApaleoAuthError } from "../apaleo/errors.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import {
  formatAvailability,
  formatGuestProfile,
  formatHousekeeping,
  formatKPIs,
  formatProperties,
  formatReservationDetail,
  formatReservationList,
} from "./format.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z
  .string()
  .regex(DATE_REGEX, "Date must be in YYYY-MM-DD format");

/** Local calendar date (server time zone) as YYYY-MM-DD. */
function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function text(body: string): CallToolResult {
  return { content: [{ type: "text", text: body }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export function registerReadTools(
  server: McpServer,
  adapter: PMSAdapter,
  config: AppConfig,
  logger: Logger,
): void {
  const defaultProperty = config.apaleo.defaultPropertyId;

  /** Resolve the property id from an argument or the configured default. */
  function resolveProperty(propertyId: string | undefined): string {
    const resolved = propertyId ?? defaultProperty;
    if (!resolved) {
      throw new Error(
        "No property specified. Pass `propertyId`, or set APALEO_DEFAULT_PROPERTY_ID " +
          "in your .env. Use the `list_properties` tool to see available property ids.",
      );
    }
    return resolved;
  }

  /** Run a tool body, converting errors into friendly, non-leaking results. */
  async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NotFoundError) return errorResult(error.message);
      if (error instanceof CapabilityNotSupportedError) return errorResult(error.message);
      if (error instanceof ApaleoAuthError) {
        return errorResult(`Authentication failed. ${error.message}`);
      }
      if (error instanceof ApaleoApiError) {
        return errorResult(`The PMS returned an error: ${error.message}`);
      }
      if (error instanceof Error) return errorResult(error.message);
      return errorResult("Unexpected error.");
    }
  }

  const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

  server.registerTool(
    "list_properties",
    {
      title: "List properties",
      description:
        "List the hotels/properties accessible with the configured credentials, " +
        "with their ids, currency and time zone. Use the id with other tools.",
      inputSchema: {},
      annotations: readOnly,
    },
    () => run(async () => text(formatProperties(await adapter.listProperties()))),
  );

  server.registerTool(
    "get_arrivals",
    {
      title: "Get arrivals",
      description:
        "List reservations arriving (checking in) on a given date. Defaults to today.",
      inputSchema: {
        propertyId: z
          .string()
          .optional()
          .describe("Property id (defaults to APALEO_DEFAULT_PROPERTY_ID)"),
        date: dateField.optional().describe("Arrival date YYYY-MM-DD; defaults to today"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const propertyId = resolveProperty(args.propertyId);
        const date = args.date ?? today();
        const list = await adapter.getArrivals({ propertyId, date });
        return text(
          formatReservationList(list, `No arrivals for ${propertyId} on ${date}.`),
        );
      }),
  );

  server.registerTool(
    "get_departures",
    {
      title: "Get departures",
      description:
        "List reservations departing (checking out) on a given date. Defaults to today.",
      inputSchema: {
        propertyId: z
          .string()
          .optional()
          .describe("Property id (defaults to APALEO_DEFAULT_PROPERTY_ID)"),
        date: dateField.optional().describe("Departure date YYYY-MM-DD; defaults to today"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const propertyId = resolveProperty(args.propertyId);
        const date = args.date ?? today();
        const list = await adapter.getDepartures({ propertyId, date });
        return text(
          formatReservationList(list, `No departures for ${propertyId} on ${date}.`),
        );
      }),
  );

  server.registerTool(
    "search_reservations",
    {
      title: "Search reservations",
      description:
        "Search reservations by guest name, status, and/or a date window. All " +
        "filters are optional. Returns matching reservations.",
      inputSchema: {
        propertyId: z.string().optional().describe("Restrict to this property id"),
        guestName: z.string().optional().describe("Guest name to match (first/last/full)"),
        status: z
          .array(z.enum(["confirmed", "in_house", "checked_out", "canceled", "no_show"]))
          .optional()
          .describe("Restrict to these reservation statuses"),
        from: dateField.optional().describe("Start of date window (YYYY-MM-DD)"),
        to: dateField.optional().describe("End of date window (YYYY-MM-DD)"),
        dateType: z
          .enum(["arrival", "departure", "stay"])
          .optional()
          .describe("Which date the window applies to (default: stay)"),
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Max results (default 50)"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        if ((args.from && !args.to) || (args.to && !args.from)) {
          return errorResult("Provide both `from` and `to` for a date window, or neither.");
        }
        const query: Parameters<PMSAdapter["searchReservations"]>[0] = {
          limit: args.limit ?? 50,
        };
        if (args.propertyId) query.propertyId = args.propertyId;
        else if (defaultProperty) query.propertyId = defaultProperty;
        if (args.guestName) query.guestName = args.guestName;
        if (args.status) query.status = args.status;
        if (args.from && args.to) {
          query.dateRange = { from: args.from, to: args.to, type: args.dateType ?? "stay" };
        }
        const list = await adapter.searchReservations(query);
        return text(formatReservationList(list, "No reservations matched your search."));
      }),
  );

  server.registerTool(
    "get_reservation",
    {
      title: "Get reservation",
      description: "Fetch full details of a single reservation by its id.",
      inputSchema: {
        reservationId: z.string().min(1).describe("The reservation id, e.g. ABCDEF-1"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () =>
        text(formatReservationDetail(await adapter.getReservation(args.reservationId))),
      ),
  );

  server.registerTool(
    "get_availability",
    {
      title: "Get availability",
      description:
        "Show how many units are bookable per room type for a date range.",
      inputSchema: {
        propertyId: z.string().optional().describe("Property id (defaults to config)"),
        from: dateField.describe("Range start (YYYY-MM-DD)"),
        to: dateField.describe("Range end (YYYY-MM-DD)"),
        unitGroupId: z.string().optional().describe("Restrict to one room type (unit group)"),
        adults: z.number().int().positive().optional().describe("Occupancy to check for"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const propertyId = resolveProperty(args.propertyId);
        const query: Parameters<PMSAdapter["getAvailability"]>[0] = {
          propertyId,
          from: args.from,
          to: args.to,
        };
        if (args.unitGroupId) query.unitGroupId = args.unitGroupId;
        if (args.adults !== undefined) query.adults = args.adults;
        return text(formatAvailability(await adapter.getAvailability(query)));
      }),
  );

  server.registerTool(
    "get_guest",
    {
      title: "Get guest",
      description:
        "Look up a guest by email or name and return their profile and " +
        "reservation history. Provide at least one of email or name.",
      inputSchema: {
        email: z.string().optional().describe("Guest email"),
        name: z.string().optional().describe("Guest name"),
        propertyId: z.string().optional().describe("Restrict search to this property id"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        if (!args.email && !args.name) {
          return errorResult("Provide at least one of `email` or `name`.");
        }
        const lookup: Parameters<PMSAdapter["getGuest"]>[0] = {};
        if (args.email) lookup.email = args.email;
        if (args.name) lookup.name = args.name;
        if (args.propertyId) lookup.propertyId = args.propertyId;
        else if (defaultProperty) lookup.propertyId = defaultProperty;
        return text(formatGuestProfile(await adapter.getGuest(lookup)));
      }),
  );

  server.registerTool(
    "get_occupancy_kpis",
    {
      title: "Get occupancy KPIs",
      description:
        "Occupancy, ADR and RevPAR for a property over a date range. The output " +
        "states the exact methodology used to derive the figures.",
      inputSchema: {
        propertyId: z.string().optional().describe("Property id (defaults to config)"),
        from: dateField.describe("Period start (YYYY-MM-DD)"),
        to: dateField.describe("Period end, exclusive checkout day (YYYY-MM-DD)"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const propertyId = resolveProperty(args.propertyId);
        const kpis = await adapter.getOccupancyKPIs({
          propertyId,
          from: args.from,
          to: args.to,
        });
        return text(formatKPIs(kpis));
      }),
  );

  server.registerTool(
    "get_housekeeping",
    {
      title: "Get housekeeping",
      description:
        "Show the housekeeping condition (clean/dirty/…) and occupancy of a " +
        "property's units.",
      inputSchema: {
        propertyId: z.string().optional().describe("Property id (defaults to config)"),
        unitGroupId: z.string().optional().describe("Restrict to one room type (unit group)"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const propertyId = resolveProperty(args.propertyId);
        const query: Parameters<PMSAdapter["getHousekeeping"]>[0] = { propertyId };
        if (args.unitGroupId) query.unitGroupId = args.unitGroupId;
        const statuses = await adapter.getHousekeeping(query);
        return text(formatHousekeeping(statuses, propertyId));
      }),
  );

  logger.info("Registered 9 read-only tools.");
}
