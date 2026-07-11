/**
 * Configuration loading & validation.
 *
 * Credentials are read EXCLUSIVELY from environment variables — never hardcoded.
 * `loadConfig` is pure (takes an env object) so it is easy to test, and its
 * error messages list only variable NAMES, never their values.
 */

import { z } from "zod";
import { ConfigError } from "./apaleo/errors.js";
import type { LogLevel } from "./logger.js";

const DEFAULT_TOKEN_URL = "https://identity.apaleo.com/connect/token";
const DEFAULT_API_BASE_URL = "https://api.apaleo.com";

export interface ApaleoConfig {
  clientId: string;
  clientSecret: string;
  enableWrites: boolean;
  defaultPropertyId: string | undefined;
  tokenUrl: string;
  apiBaseUrl: string;
}

export interface AppConfig {
  apaleo: ApaleoConfig;
  logLevel: LogLevel;
}

/** Truthy string values for boolean env vars. */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** Validate that a string is an absolute http(s) URL; return it normalized. */
function assertUrl(value: string, varName: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${varName} must be a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigError(`${varName} must be an http(s) URL.`);
  }
  return value;
}

const RawEnvSchema = z.object({
  APALEO_CLIENT_ID: z
    .string({ error: "APALEO_CLIENT_ID is required" })
    .min(1, "APALEO_CLIENT_ID is required"),
  APALEO_CLIENT_SECRET: z
    .string({ error: "APALEO_CLIENT_SECRET is required" })
    .min(1, "APALEO_CLIENT_SECRET is required"),
  APALEO_ENABLE_WRITES: z.string().optional(),
  APALEO_DEFAULT_PROPERTY_ID: z.string().optional(),
  APALEO_TOKEN_URL: z.string().min(1).optional(),
  APALEO_API_BASE_URL: z.string().min(1).optional(),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug"], {
      error: "LOG_LEVEL must be one of: error, warn, info, debug",
    })
    .optional(),
});

/**
 * Load and validate configuration from an environment object (defaults to
 * `process.env`). Throws {@link ConfigError} with a friendly, value-free
 * message when something is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = RawEnvSchema.safeParse(env);
  if (!parsed.success) {
    // Report only variable names / static messages — never values.
    const messages = parsed.error.issues.map((issue) => {
      const name = issue.path.join(".") || "config";
      return `- ${name}: ${issue.message}`;
    });
    throw new ConfigError(
      `Invalid configuration. Check your .env file (copy .env.example):\n${messages.join(
        "\n",
      )}`,
    );
  }

  const raw = parsed.data;
  const defaultPropertyId = raw.APALEO_DEFAULT_PROPERTY_ID?.trim();

  return {
    apaleo: {
      clientId: raw.APALEO_CLIENT_ID,
      clientSecret: raw.APALEO_CLIENT_SECRET,
      enableWrites: parseBoolean(raw.APALEO_ENABLE_WRITES, false),
      defaultPropertyId:
        defaultPropertyId && defaultPropertyId.length > 0
          ? defaultPropertyId
          : undefined,
      tokenUrl: assertUrl(
        raw.APALEO_TOKEN_URL ?? DEFAULT_TOKEN_URL,
        "APALEO_TOKEN_URL",
      ),
      apiBaseUrl: assertUrl(
        raw.APALEO_API_BASE_URL ?? DEFAULT_API_BASE_URL,
        "APALEO_API_BASE_URL",
      ),
    },
    logLevel: raw.LOG_LEVEL ?? "info",
  };
}
