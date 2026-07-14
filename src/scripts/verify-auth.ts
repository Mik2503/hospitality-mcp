#!/usr/bin/env node
/**
 * verify:auth — a self-contained smoke test for Apaleo authentication.
 *
 * Run it once you have sandbox credentials in your `.env`:
 *     npm run verify:auth
 *
 * It will:
 *   1. Load & validate your configuration.
 *   2. Obtain an OAuth2 access token from Apaleo (client credentials).
 *   3. Make one trivial read call (GET /inventory/v1/properties).
 *
 * It prints only non-sensitive information — never your secret or the token.
 */

import { config as loadDotenv } from "dotenv";
import { loadConfig } from "../config.js";

loadDotenv({ quiet: true });
import { createLogger } from "../logger.js";
import { createApaleoRuntime } from "../apaleo/factory.js";
import { ConfigError, ApaleoAuthError, ApaleoApiError } from "../apaleo/errors.js";

interface PropertiesResponse {
  properties?: Array<{ id?: string; name?: string }>;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  if (config.provider !== "apaleo" || !config.apaleo) {
    throw new ConfigError(
      "verify:auth only applies to the Apaleo provider. Unset PMS_PROVIDER (or set it to apaleo) and provide APALEO_CLIENT_ID / APALEO_CLIENT_SECRET.",
    );
  }

  logger.info(
    `Configuration loaded. Writes are ${
      config.apaleo.enableWrites ? "ENABLED" : "disabled (read-only)"
    }.`,
  );

  const { tokenManager, client } = createApaleoRuntime(config.apaleo, logger);

  // Step 1: obtain a token.
  await tokenManager.getAccessToken();
  logger.info("✅ Access token obtained successfully.");

  // Step 2: a trivial read call to prove the token works end-to-end.
  const data = await client.get<PropertiesResponse>(
    "/inventory/v1/properties",
  );
  const properties = data.properties ?? [];
  logger.info(
    `✅ Read call succeeded: GET /inventory/v1/properties returned ${properties.length} propert${
      properties.length === 1 ? "y" : "ies"
    }.`,
  );
  for (const property of properties.slice(0, 10)) {
    logger.info(`   - ${property.id ?? "?"}: ${property.name ?? "(unnamed)"}`);
  }

  logger.info("🎉 Apaleo authentication is working.");
}

main().catch((error: unknown) => {
  if (
    error instanceof ConfigError ||
    error instanceof ApaleoAuthError ||
    error instanceof ApaleoApiError
  ) {
    // Friendly, non-sensitive message.
    console.error(`\n❌ ${error.message}\n`);
  } else {
    console.error("\n❌ Unexpected error during verification:", error, "\n");
  }
  process.exitCode = 1;
});
