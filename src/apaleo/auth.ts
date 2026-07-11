/**
 * Apaleo OAuth2 client-credentials token manager.
 *
 * Flow (verified against https://apaleo.dev/guides/oauth-connection/simple-client.html):
 *   POST https://identity.apaleo.com/connect/token
 *   Authorization: Basic base64(clientId:clientSecret)
 *   Content-Type: application/x-www-form-urlencoded
 *   body: grant_type=client_credentials&scope=<space separated>
 *
 * Guarantees:
 *  - The access token is cached in memory and reused until shortly before it
 *    expires. It is NEVER written to disk.
 *  - Concurrent callers share a single in-flight request (single-flight), so a
 *    burst of tool calls triggers at most one token request.
 *  - `invalidate()` lets callers force a refresh (e.g. after a 401).
 *  - The client secret is never logged or included in error messages.
 */

import { z } from "zod";
import { ApaleoAuthError } from "./errors.js";
import { redactToken } from "../util/redact.js";
import type { Logger } from "../logger.js";

/** Shape of a successful Apaleo token response. */
const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string().optional(),
});

interface CachedToken {
  accessToken: string;
  /** Epoch millis after which we should refresh (already includes skew). */
  refreshAt: number;
  scope: string | undefined;
}

export interface TokenManagerOptions {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes: string[];
  logger: Logger;
  /** Injectable fetch (defaults to global fetch) — handy for tests. */
  fetchFn?: typeof fetch;
  /** Injectable clock returning epoch millis (defaults to Date.now) — for tests. */
  now?: () => number;
  /** Refresh this many seconds before the real expiry. Default 60. */
  expirySkewSeconds?: number;
}

export class ApaleoTokenManager {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly scopes: string[];
  private readonly logger: Logger;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly skewMs: number;

  private cached: CachedToken | null = null;
  private pending: Promise<CachedToken> | null = null;

  constructor(options: TokenManagerOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.tokenUrl = options.tokenUrl;
    this.scopes = options.scopes;
    this.logger = options.logger;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.skewMs = (options.expirySkewSeconds ?? 60) * 1000;
  }

  /** Return a valid access token, fetching or refreshing as needed. */
  async getAccessToken(): Promise<string> {
    const cached = this.cached;
    if (cached && cached.refreshAt > this.now()) {
      return cached.accessToken;
    }
    // Single-flight: coalesce concurrent refreshes into one request.
    if (!this.pending) {
      this.pending = this.requestToken().finally(() => {
        this.pending = null;
      });
    }
    const token = await this.pending;
    return token.accessToken;
  }

  /** Drop the cached token so the next call fetches a fresh one (e.g. on 401). */
  invalidate(): void {
    this.cached = null;
  }

  private async requestToken(): Promise<CachedToken> {
    const basic = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const body = new URLSearchParams({ grant_type: "client_credentials" });
    if (this.scopes.length > 0) {
      body.set("scope", this.scopes.join(" "));
    }

    this.logger.debug(
      `Requesting Apaleo access token (scopes: ${this.scopes.join(" ") || "<none>"})`,
    );

    let response: Response;
    try {
      response = await this.fetchFn(this.tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });
    } catch (cause) {
      // Network-level failure. `cause` cannot contain our secret.
      throw new ApaleoAuthError(
        `Could not reach the Apaleo token endpoint. Check your network and APALEO_TOKEN_URL.`,
      );
    }

    if (!response.ok) {
      throw new ApaleoAuthError(
        await describeAuthFailure(response),
        response.status,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApaleoAuthError(
        "Apaleo returned a token response that was not valid JSON.",
        response.status,
      );
    }

    const result = TokenResponseSchema.safeParse(json);
    if (!result.success) {
      throw new ApaleoAuthError(
        "Apaleo token response was missing expected fields (access_token / expires_in).",
        response.status,
      );
    }

    const token = result.data;
    const refreshAt =
      this.now() + Math.max(0, token.expires_in * 1000 - this.skewMs);

    this.cached = {
      accessToken: token.access_token,
      refreshAt,
      scope: token.scope,
    };

    this.logger.info(
      `Obtained Apaleo access token ${redactToken(token.access_token)}, ` +
        `valid for ${token.expires_in}s` +
        (token.scope ? ` (granted scopes: ${token.scope})` : ""),
    );

    return this.cached;
  }
}

/**
 * Build a safe, useful error message from a failed token response.
 * Includes the OAuth `error` code (e.g. "invalid_client") when present — these
 * are not sensitive — but never the request credentials.
 */
async function describeAuthFailure(response: Response): Promise<string> {
  const hint =
    response.status === 400 || response.status === 401
      ? " This usually means APALEO_CLIENT_ID / APALEO_CLIENT_SECRET are wrong, " +
        "or the connected app is missing the requested scopes."
      : "";

  let code = "";
  try {
    const data = (await response.json()) as {
      error?: unknown;
      error_description?: unknown;
    };
    const parts = [data.error, data.error_description]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(": ");
    if (parts) code = ` (${parts})`;
  } catch {
    // Non-JSON body — ignore; we still have the status code.
  }

  return `Apaleo token request failed with HTTP ${response.status}${code}.${hint}`;
}
