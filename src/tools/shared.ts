/**
 * Shared helpers for MCP tool handlers: result builders, input pieces, and
 * uniform error handling that never leaks secrets.
 */

import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CapabilityNotSupportedError, NotFoundError, WriteNotAllowedError } from "../core/index.js";
import { ApaleoApiError, ApaleoAuthError } from "../apaleo/errors.js";

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const dateField = z
  .string()
  .regex(DATE_REGEX, "Date must be in YYYY-MM-DD format");

/** Local calendar date (server time zone) as YYYY-MM-DD. */
export function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function text(body: string): CallToolResult {
  return { content: [{ type: "text", text: body }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Run a tool body, converting errors into friendly, non-leaking results. */
export async function run(
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof NotFoundError) return errorResult(error.message);
    if (error instanceof CapabilityNotSupportedError) return errorResult(error.message);
    if (error instanceof WriteNotAllowedError) return errorResult(error.message);
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

export const READ_ONLY_HINT = { readOnlyHint: true, openWorldHint: true } as const;

/**
 * Build a resolver that returns the given property id or the configured
 * default, throwing a helpful error when neither is available.
 */
export function resolvePropertyFactory(
  defaultProperty: string | undefined,
): (propertyId: string | undefined) => string {
  return (propertyId) => {
    const resolved = propertyId ?? defaultProperty;
    if (!resolved) {
      throw new Error(
        "No property specified. Pass `propertyId`, or set APALEO_DEFAULT_PROPERTY_ID " +
          "in your .env. Use the `list_properties` tool to see available property ids.",
      );
    }
    return resolved;
  };
}
