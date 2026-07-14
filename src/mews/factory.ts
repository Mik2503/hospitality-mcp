/** Wires configuration into a ready-to-use Mews client + adapter. */

import { MewsClient } from "./client.js";
import { MewsAdapter } from "./adapter.js";
import type { MewsConfig } from "../config.js";
import type { Logger } from "../logger.js";

export interface MewsRuntime {
  client: MewsClient;
  adapter: MewsAdapter;
}

export function createMewsRuntime(config: MewsConfig, logger: Logger): MewsRuntime {
  const client = new MewsClient(config, logger);
  return { client, adapter: new MewsAdapter(client, logger) };
}
