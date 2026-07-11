/**
 * Wires configuration into a ready-to-use Apaleo token manager and HTTP client.
 * Used by the MCP server (Phase 4) and the `verify:auth` script.
 */

import { ApaleoTokenManager } from "./auth.js";
import { ApaleoClient } from "./client.js";
import { scopesForConfig } from "./scopes.js";
import type { ApaleoConfig } from "../config.js";
import type { Logger } from "../logger.js";

export interface ApaleoRuntime {
  tokenManager: ApaleoTokenManager;
  client: ApaleoClient;
}

export function createApaleoRuntime(
  config: ApaleoConfig,
  logger: Logger,
): ApaleoRuntime {
  const tokenManager = new ApaleoTokenManager({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    tokenUrl: config.tokenUrl,
    scopes: scopesForConfig(config.enableWrites),
    logger,
  });

  const client = new ApaleoClient({
    baseUrl: config.apiBaseUrl,
    tokenManager,
    logger,
  });

  return { tokenManager, client };
}
