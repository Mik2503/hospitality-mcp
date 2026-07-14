/**
 * Thin Mews Connector API client.
 *
 * The Connector API is POST-only: every operation takes a JSON body that must
 * include the `ClientToken`, `AccessToken` and `Client` strings. Those are
 * injected here from config and are NEVER logged.
 */

import type { MewsConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { MewsApiError } from "./errors.js";

const CONNECTOR_PATH = "/api/connector/v1";
const MAX_RETRIES = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MewsClient {
  private readonly config: MewsConfig;
  private readonly logger: Logger;

  constructor(config: MewsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /** Call a Connector operation (e.g. `configuration/get`) and return its JSON. */
  async post<T>(operation: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.config.apiBaseUrl}${CONNECTOR_PATH}/${operation}`;
    const payload = {
      ClientToken: this.config.clientToken,
      AccessToken: this.config.accessToken,
      Client: this.config.clientName,
      ...body,
    };

    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "1") || 1;
        this.logger.warn(`Mews rate limit hit on ${operation}; retrying in ${retryAfter}s.`);
        await sleep(retryAfter * 1000);
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        // Mews returns { Message, ... } on errors. Surface only the message.
        let message = text;
        try {
          message = (JSON.parse(text) as { Message?: string }).Message ?? text;
        } catch {
          // keep raw text
        }
        throw new MewsApiError(res.status, message.slice(0, 300));
      }

      return (text ? JSON.parse(text) : {}) as T;
    }
  }
}
