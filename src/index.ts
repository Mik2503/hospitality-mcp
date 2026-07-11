#!/usr/bin/env node
/**
 * hospitality-mcp — entry point.
 *
 * Loads configuration, wires up the Apaleo adapter, and serves the MCP tools
 * over stdio (for Claude Desktop / Claude Code). All logging goes to stderr so
 * stdout stays reserved for the MCP protocol.
 */

import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createApaleoRuntime } from "./apaleo/factory.js";
import { createServer } from "./server.js";
import { ConfigError } from "./apaleo/errors.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const { adapter } = createApaleoRuntime(config.apaleo, logger);
  const server = createServer(adapter, config, logger);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    `hospitality-mcp ready (writes ${config.apaleo.enableWrites ? "ENABLED" : "disabled"}). Listening on stdio.`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`\n${error.message}\n`);
  } else {
    console.error("Fatal error starting hospitality-mcp:", error);
  }
  process.exit(1);
});
