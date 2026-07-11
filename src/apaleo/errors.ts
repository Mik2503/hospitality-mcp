/**
 * Typed errors for the Apaleo integration.
 *
 * These carry enough context to produce a useful message to the user without
 * ever embedding credentials or tokens.
 */

/** Invalid or missing configuration (env vars). */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Failure during the OAuth2 token request. */
export class ApaleoAuthError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApaleoAuthError";
    this.status = status;
  }
}

/** Non-2xx response from an Apaleo API endpoint. */
export class ApaleoApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;

  constructor(status: number, method: string, path: string, detail?: string) {
    super(
      `Apaleo API request failed: ${method} ${path} -> HTTP ${status}` +
        (detail ? ` (${detail})` : ""),
    );
    this.name = "ApaleoApiError";
    this.status = status;
    this.method = method;
    this.path = path;
  }
}
