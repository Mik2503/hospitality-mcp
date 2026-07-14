/**
 * Configuration loading & validation.
 *
 * Credentials are read EXCLUSIVELY from environment variables — never hardcoded.
 * `loadConfig` is pure (takes an env object) so it is easy to test, and its
 * error messages list only variable NAMES, never their values.
 *
 * The active PMS is chosen with `PMS_PROVIDER`:
 *   - `apaleo` (default) — talks to a real/sandbox Apaleo account; requires
 *     `APALEO_CLIENT_ID` / `APALEO_CLIENT_SECRET`.
 *   - `demo` — serves built-in SYNTHETIC sample data; requires no credentials.
 */

import { z } from "zod";
import { ConfigError } from "./apaleo/errors.js";
import type { LogLevel } from "./logger.js";

const DEFAULT_TOKEN_URL = "https://identity.apaleo.com/connect/token";
const DEFAULT_API_BASE_URL = "https://api.apaleo.com";

/** Property id the built-in demo dataset is anchored on. */
export const DEMO_DEFAULT_PROPERTY_ID = "DEMO-BER";

/** Which PMS adapter the server runs. */
export type PmsProvider = "apaleo" | "demo" | "mews";

/** Default Mews production API base URL. */
const DEFAULT_MEWS_API_BASE_URL = "https://api.mews.com";
/** Client string sent on every Mews request. */
const DEFAULT_MEWS_CLIENT_NAME = "hospitality-mcp 0.1.0";

export interface ApaleoConfig {
  clientId: string;
  clientSecret: string;
  enableWrites: boolean;
  defaultPropertyId: string | undefined;
  tokenUrl: string;
  apiBaseUrl: string;
}

export interface MewsConfig {
  /** Integration-level token (identifies the app). */
  clientToken: string;
  /** Enterprise-level token (identifies the hotel/enterprise). */
  accessToken: string;
  /** Human-readable `Client` string sent with each request. */
  clientName: string;
  apiBaseUrl: string;
}

export interface AppConfig {
  /** Which PMS adapter to run. */
  provider: PmsProvider;
  /** Whether write tools should be enabled (provider-agnostic). */
  enableWrites: boolean;
  /** Default property id used when a tool call omits one. */
  defaultPropertyId: string | undefined;
  /** Apaleo settings — present only when `provider === "apaleo"`. */
  apaleo?: ApaleoConfig;
  /** Mews settings — present only when `provider === "mews"`. */
  mews?: MewsConfig;
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
  PMS_PROVIDER: z
    .enum(["apaleo", "demo", "mews"], {
      error: 'PMS_PROVIDER must be "apaleo", "demo" or "mews"',
    })
    .optional(),
  MEWS_CLIENT_TOKEN: z.string().optional(),
  MEWS_ACCESS_TOKEN: z.string().optional(),
  MEWS_CLIENT_NAME: z.string().optional(),
  MEWS_API_BASE_URL: z.string().min(1).optional(),
  MEWS_DEFAULT_PROPERTY_ID: z.string().optional(),
  // Apaleo credentials are validated in code (only required for the apaleo
  // provider), so they are optional at the schema level.
  APALEO_CLIENT_ID: z.string().optional(),
  APALEO_CLIENT_SECRET: z.string().optional(),
  APALEO_ENABLE_WRITES: z.string().optional(),
  APALEO_DEFAULT_PROPERTY_ID: z.string().optional(),
  APALEO_TOKEN_URL: z.string().min(1).optional(),
  APALEO_API_BASE_URL: z.string().min(1).optional(),
  DEMO_DEFAULT_PROPERTY_ID: z.string().optional(),
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
  const provider: PmsProvider = raw.PMS_PROVIDER ?? "apaleo";
  const logLevel: LogLevel = raw.LOG_LEVEL ?? "info";

  // ---- Demo provider: no credentials required. ----------------------------
  if (provider === "demo") {
    const demoDefault = raw.DEMO_DEFAULT_PROPERTY_ID?.trim();
    return {
      provider,
      enableWrites: false, // the demo adapter is read-only
      defaultPropertyId:
        demoDefault && demoDefault.length > 0
          ? demoDefault
          : DEMO_DEFAULT_PROPERTY_ID,
      logLevel,
    };
  }

  // ---- Mews provider: connector tokens required. --------------------------
  if (provider === "mews") {
    const clientToken = raw.MEWS_CLIENT_TOKEN?.trim();
    const accessToken = raw.MEWS_ACCESS_TOKEN?.trim();
    const missingMews: string[] = [];
    if (!clientToken) missingMews.push("MEWS_CLIENT_TOKEN");
    if (!accessToken) missingMews.push("MEWS_ACCESS_TOKEN");
    if (missingMews.length > 0) {
      throw new ConfigError(
        "Invalid configuration. Check your .env file (copy .env.example):\n" +
          missingMews.map((name) => `- ${name}: ${name} is required`).join("\n") +
          "\n(Tip: set PMS_PROVIDER=demo to try the server with no credentials.)",
      );
    }
    const mewsDefault = raw.MEWS_DEFAULT_PROPERTY_ID?.trim();
    return {
      provider,
      enableWrites: false, // Mews adapter is read-only in this version
      // Mews is single-enterprise; the adapter ignores the property id, but the
      // tool layer still needs a default so calls don't require one.
      defaultPropertyId: mewsDefault && mewsDefault.length > 0 ? mewsDefault : "mews",
      mews: {
        clientToken: clientToken as string,
        accessToken: accessToken as string,
        clientName: raw.MEWS_CLIENT_NAME?.trim() || DEFAULT_MEWS_CLIENT_NAME,
        apiBaseUrl: assertUrl(
          raw.MEWS_API_BASE_URL ?? DEFAULT_MEWS_API_BASE_URL,
          "MEWS_API_BASE_URL",
        ),
      },
      logLevel,
    };
  }

  // ---- Apaleo provider: credentials required. -----------------------------
  const clientId = raw.APALEO_CLIENT_ID?.trim();
  const clientSecret = raw.APALEO_CLIENT_SECRET?.trim();
  const missing: string[] = [];
  if (!clientId) missing.push("APALEO_CLIENT_ID");
  if (!clientSecret) missing.push("APALEO_CLIENT_SECRET");
  if (missing.length > 0) {
    throw new ConfigError(
      "Invalid configuration. Check your .env file (copy .env.example):\n" +
        missing.map((name) => `- ${name}: ${name} is required`).join("\n") +
        "\n(Tip: set PMS_PROVIDER=demo to try the server with no credentials.)",
    );
  }

  const rawDefault = raw.APALEO_DEFAULT_PROPERTY_ID?.trim();
  const apaleo: ApaleoConfig = {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    enableWrites: parseBoolean(raw.APALEO_ENABLE_WRITES, false),
    defaultPropertyId:
      rawDefault && rawDefault.length > 0 ? rawDefault : undefined,
    tokenUrl: assertUrl(
      raw.APALEO_TOKEN_URL ?? DEFAULT_TOKEN_URL,
      "APALEO_TOKEN_URL",
    ),
    apiBaseUrl: assertUrl(
      raw.APALEO_API_BASE_URL ?? DEFAULT_API_BASE_URL,
      "APALEO_API_BASE_URL",
    ),
  };

  return {
    provider,
    enableWrites: apaleo.enableWrites,
    defaultPropertyId: apaleo.defaultPropertyId,
    apaleo,
    logLevel,
  };
}
