/**
 * Thin authenticated HTTP client for the Apaleo API.
 *
 * Responsibilities:
 *  - Attach a valid Bearer token to every request (via the token manager).
 *  - Transparently retry ONCE on 401 after invalidating the cached token, in
 *    case the token expired mid-flight.
 *  - Surface non-2xx responses as {@link ApaleoApiError} without leaking the
 *    Authorization header or token.
 *
 * The higher-level Apaleo adapter (Phase 3) is built on top of this.
 */

import { ApaleoApiError } from "./errors.js";
import type { ApaleoTokenManager } from "./auth.js";
import type { Logger } from "../logger.js";

export interface ApaleoClientOptions {
  baseUrl: string;
  tokenManager: ApaleoTokenManager;
  logger: Logger;
  fetchFn?: typeof fetch;
}

/** A single query-parameter value; arrays become repeated params. */
export type QueryValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | Array<string | number | boolean>;

export interface RequestOptions {
  /** Query parameters. Values are stringified; undefined/null are dropped. */
  query?: Record<string, QueryValue>;
  /** JSON request body (for future write operations). */
  body?: unknown;
}

export class ApaleoClient {
  private readonly baseUrl: string;
  private readonly tokenManager: ApaleoTokenManager;
  private readonly logger: Logger;
  private readonly fetchFn: typeof fetch;

  constructor(options: ApaleoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokenManager = options.tokenManager;
    this.logger = options.logger;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>("GET", path, { query: query ?? {} });
  }

  post<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, options);
  }

  patch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PATCH", path, options);
  }

  put<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PUT", path, options);
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }

  private buildUrl(path: string, query: RequestOptions["query"]): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(this.baseUrl + normalizedPath);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        // Repeated params, e.g. ?propertyIds=BER&propertyIds=MUC
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);

    const doFetch = async (token: string): Promise<Response> => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };
      let bodyInit: string | undefined;
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        bodyInit = JSON.stringify(options.body);
      }
      // Note: `headers` (incl. Authorization) is intentionally never logged.
      this.logger.debug(`Apaleo request: ${method} ${path}`);
      return this.fetchFn(url, { method, headers, body: bodyInit });
    };

    let token = await this.tokenManager.getAccessToken();
    let response = await doFetch(token);

    if (response.status === 401) {
      // Token may have expired or been revoked — refresh once and retry.
      this.logger.debug("Apaleo returned 401; refreshing token and retrying.");
      this.tokenManager.invalidate();
      token = await this.tokenManager.getAccessToken();
      response = await doFetch(token);
    }

    if (!response.ok) {
      throw new ApaleoApiError(
        response.status,
        method,
        path,
        await safeErrorDetail(response),
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

/** Extract a short, non-sensitive detail from an error response body. */
async function safeErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as {
      type?: unknown;
      title?: unknown;
      messages?: unknown;
    };
    const title = typeof data.title === "string" ? data.title : undefined;
    const type = typeof data.type === "string" ? data.type : undefined;
    return title ?? type;
  } catch {
    return undefined;
  }
}
