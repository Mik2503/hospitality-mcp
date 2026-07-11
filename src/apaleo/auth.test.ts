import { test } from "node:test";
import assert from "node:assert/strict";
import { ApaleoTokenManager } from "./auth.js";
import { ApaleoAuthError } from "./errors.js";
import type { Logger } from "../logger.js";

const silentLogger: Logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "super-secret-value";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** A controllable fake fetch that records calls and returns queued responses. */
function makeFetch(
  responder: (call: FetchCall) => Promise<Response> | Response,
): { fetchFn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return responder({ url, init });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function tokenResponse(
  accessToken: string,
  expiresIn = 3600,
  scope = "setup.read reservations.read",
): Response {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      expires_in: expiresIn,
      token_type: "Bearer",
      scope,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeManager(
  fetchFn: typeof fetch,
  now: () => number,
  scopes: string[] = ["setup.read", "reservations.read"],
): ApaleoTokenManager {
  return new ApaleoTokenManager({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    tokenUrl: "https://identity.apaleo.test/connect/token",
    scopes,
    logger: silentLogger,
    fetchFn,
    now,
  });
}

test("sends correct client-credentials request and returns the token", async () => {
  const { fetchFn, calls } = makeFetch(() => tokenResponse("token-abc"));
  const manager = makeManager(fetchFn, () => 0);

  const token = await manager.getAccessToken();
  assert.equal(token, "token-abc");
  assert.equal(calls.length, 1);

  const call = calls[0]!;
  assert.equal(call.url, "https://identity.apaleo.test/connect/token");
  assert.equal(call.init?.method, "POST");

  const headers = new Headers(call.init?.headers as Record<string, string>);
  const expectedBasic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64",
  );
  assert.equal(headers.get("authorization"), `Basic ${expectedBasic}`);
  assert.equal(
    headers.get("content-type"),
    "application/x-www-form-urlencoded",
  );

  const body = String(call.init?.body);
  assert.match(body, /grant_type=client_credentials/);
  assert.match(body, /scope=setup.read\+reservations.read/);
});

test("caches the token and does not refetch while valid", async () => {
  const { fetchFn, calls } = makeFetch(() => tokenResponse("token-1"));
  const manager = makeManager(fetchFn, () => 0);

  assert.equal(await manager.getAccessToken(), "token-1");
  assert.equal(await manager.getAccessToken(), "token-1");
  assert.equal(calls.length, 1, "should reuse cached token");
});

test("refreshes the token after expiry (accounting for skew)", async () => {
  let counter = 0;
  const { fetchFn, calls } = makeFetch(() =>
    tokenResponse(`token-${++counter}`, 3600),
  );
  let clock = 0;
  const manager = makeManager(fetchFn, () => clock);

  assert.equal(await manager.getAccessToken(), "token-1");

  // Still valid just before refresh window (3600s - 60s skew = 3540s).
  clock = 3_500_000;
  assert.equal(await manager.getAccessToken(), "token-1");
  assert.equal(calls.length, 1);

  // Past the refresh window -> new token.
  clock = 3_600_000;
  assert.equal(await manager.getAccessToken(), "token-2");
  assert.equal(calls.length, 2);
});

test("coalesces concurrent requests into a single fetch (single-flight)", async () => {
  let resolveResponse: ((r: Response) => void) | undefined;
  const gate = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  const { fetchFn, calls } = makeFetch(() => gate);
  const manager = makeManager(fetchFn, () => 0);

  const p1 = manager.getAccessToken();
  const p2 = manager.getAccessToken();
  const p3 = manager.getAccessToken();

  resolveResponse!(tokenResponse("token-shared"));
  const results = await Promise.all([p1, p2, p3]);

  assert.deepEqual(results, ["token-shared", "token-shared", "token-shared"]);
  assert.equal(calls.length, 1, "concurrent callers share one request");
});

test("invalidate() forces a refresh on the next call", async () => {
  let counter = 0;
  const { fetchFn, calls } = makeFetch(() =>
    tokenResponse(`token-${++counter}`),
  );
  const manager = makeManager(fetchFn, () => 0);

  assert.equal(await manager.getAccessToken(), "token-1");
  manager.invalidate();
  assert.equal(await manager.getAccessToken(), "token-2");
  assert.equal(calls.length, 2);
});

test("throws ApaleoAuthError on failure WITHOUT leaking the secret", async () => {
  const { fetchFn } = makeFetch(
    () =>
      new Response(
        JSON.stringify({
          error: "invalid_client",
          error_description: "Invalid client credentials",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
  );
  const manager = makeManager(fetchFn, () => 0);

  await assert.rejects(
    () => manager.getAccessToken(),
    (err: unknown) => {
      assert.ok(err instanceof ApaleoAuthError);
      assert.equal(err.status, 400);
      assert.match(err.message, /invalid_client/);
      // The secret must never appear in the error surface.
      assert.doesNotMatch(err.message, new RegExp(CLIENT_SECRET));
      return true;
    },
  );
});

test("rejects a malformed token response", async () => {
  const { fetchFn } = makeFetch(
    () =>
      new Response(JSON.stringify({ not_a_token: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const manager = makeManager(fetchFn, () => 0);

  await assert.rejects(() => manager.getAccessToken(), ApaleoAuthError);
});
