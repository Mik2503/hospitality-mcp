/**
 * Builds the MCP server and registers the hospitality tools.
 *
 * The server talks to hotel data only through the normalized {@link PMSAdapter},
 * so swapping in a different PMS never touches this file.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PMSAdapter } from "./core/index.js";
import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { registerReadTools } from "./tools/register.js";

export const SERVER_NAME = "hospitality-mcp";
export const SERVER_VERSION = "0.1.0";

export function createServer(
  adapter: PMSAdapter,
  config: AppConfig,
  logger: Logger,
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Query and operate a hotel's PMS in natural language. Read tools are " +
        "always available; property ids come from `list_properties` or the " +
        "configured default.",
    },
  );

  registerReadTools(server, adapter, config, logger);
  // Phase 5 will conditionally register write tools here when writes are enabled.

  return server;
}
