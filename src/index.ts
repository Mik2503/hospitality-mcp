#!/usr/bin/env node
/**
 * hospitality-mcp — entry point.
 *
 * Loads configuration, wires up the Apaleo adapter, and serves the MCP tools
 * over stdio (for Claude Desktop / Claude Code). All logging goes to stderr so
 * stdout stays reserved for the MCP protocol.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";

// Load .env from the project root relative to THIS module (both `dist/` and
// `src/` sit one level under the root). This makes the server work no matter
// what working directory the MCP host launches it from, so the credentials can
// live only in the project's .env — not duplicated into the host config.
// `quiet: true` is essential: dotenv otherwise prints a banner to STDOUT, which
// would corrupt the MCP JSON-RPC stream. Nothing but the protocol may touch it.
loadDotenv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env"),
  quiet: true,
});
import { createLogger } from "./logger.js";
import type { PMSAdapter } from "./core/index.js";
import { createApaleoRuntime } from "./apaleo/factory.js";
import { createDemoAdapter } from "./demo/factory.js";
import { createMewsRuntime } from "./mews/factory.js";
import { createServer } from "./server.js";
import { ConfigError } from "./apaleo/errors.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  let adapter: PMSAdapter;
  if (config.provider === "demo") {
    adapter = createDemoAdapter(logger);
    logger.warn(
      "⚠️  DEMO MODE — serving SYNTHETIC sample data, NOT a real hotel. " +
        "To use live data, set PMS_PROVIDER=apaleo and add your Apaleo credentials to .env.",
    );
  } else if (config.provider === "mews") {
    if (!config.mews) {
      throw new ConfigError("Mews provider selected but Mews configuration is missing.");
    }
    adapter = createMewsRuntime(config.mews, logger).adapter;
  } else {
    if (!config.apaleo) {
      throw new ConfigError("Apaleo provider selected but Apaleo configuration is missing.");
    }
    adapter = createApaleoRuntime(config.apaleo, logger).adapter;
  }

  const server = createServer(adapter, config, logger);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    `hospitality-mcp ready (provider: ${config.provider}, writes ${config.enableWrites ? "ENABLED" : "disabled"}). Listening on stdio.`,
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
