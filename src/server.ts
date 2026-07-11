/**
 * Builds the MCP server and registers the hospitality tools.
 *
 * The server talks to hotel data only through the normalized {@link PMSAdapter},
 * so swapping in a different PMS never touches this file.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PMSAdapter } from "./core/index.js";
import { isWritable } from "./core/index.js";
import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { registerReadTools } from "./tools/register.js";
import { registerWriteTools } from "./tools/write.js";

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

  // Write tools are registered ONLY when the user explicitly enabled writes AND
  // the adapter can perform them. Otherwise they don't exist at all.
  if (config.apaleo.enableWrites) {
    if (isWritable(adapter)) {
      registerWriteTools(server, adapter, config, logger);
    } else {
      logger.warn(
        "APALEO_ENABLE_WRITES is true but the active adapter does not support writes.",
      );
    }
  } else {
    logger.info("Writes disabled (read-only). Set APALEO_ENABLE_WRITES=true to enable.");
  }

  return server;
}
