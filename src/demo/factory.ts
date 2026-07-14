/**
 * Wires up the demo adapter. Mirrors `apaleo/factory.ts` so `index.ts` selects a
 * provider uniformly.
 */

import { DemoAdapter, type DemoAdapterOptions } from "./adapter.js";
import type { Logger } from "../logger.js";

export function createDemoAdapter(
  logger: Logger,
  options?: DemoAdapterOptions,
): DemoAdapter {
  return new DemoAdapter(logger, options);
}
