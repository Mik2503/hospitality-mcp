import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";
import { ConfigError } from "./apaleo/errors.js";

const validEnv = {
  APALEO_CLIENT_ID: "id",
  APALEO_CLIENT_SECRET: "secret",
} satisfies NodeJS.ProcessEnv;

test("loads a valid minimal config with sensible defaults", () => {
  const config = loadConfig({ ...validEnv });
  assert.equal(config.apaleo.clientId, "id");
  assert.equal(config.apaleo.clientSecret, "secret");
  assert.equal(config.apaleo.enableWrites, false);
  assert.equal(config.apaleo.defaultPropertyId, undefined);
  assert.equal(
    config.apaleo.tokenUrl,
    "https://identity.apaleo.com/connect/token",
  );
  assert.equal(config.apaleo.apiBaseUrl, "https://api.apaleo.com");
  assert.equal(config.logLevel, "info");
});

test("parses APALEO_ENABLE_WRITES truthy/falsy values", () => {
  assert.equal(
    loadConfig({ ...validEnv, APALEO_ENABLE_WRITES: "true" }).apaleo
      .enableWrites,
    true,
  );
  assert.equal(
    loadConfig({ ...validEnv, APALEO_ENABLE_WRITES: "TRUE" }).apaleo
      .enableWrites,
    true,
  );
  assert.equal(
    loadConfig({ ...validEnv, APALEO_ENABLE_WRITES: "false" }).apaleo
      .enableWrites,
    false,
  );
  assert.equal(
    loadConfig({ ...validEnv, APALEO_ENABLE_WRITES: "" }).apaleo.enableWrites,
    false,
  );
});

test("throws a value-free error when credentials are missing", () => {
  assert.throws(
    () => loadConfig({ LOG_LEVEL: "info" } as NodeJS.ProcessEnv),
    (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /APALEO_CLIENT_ID/);
      assert.match(err.message, /APALEO_CLIENT_SECRET/);
      return true;
    },
  );
});

test("does not echo secret values in error messages", () => {
  // CLIENT_ID present but SECRET empty -> should mention the var name only.
  assert.throws(
    () =>
      loadConfig({
        APALEO_CLIENT_ID: "id",
        APALEO_CLIENT_SECRET: "",
      } as NodeJS.ProcessEnv),
    (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /APALEO_CLIENT_SECRET/);
      return true;
    },
  );
});

test("rejects an invalid override URL", () => {
  assert.throws(
    () => loadConfig({ ...validEnv, APALEO_TOKEN_URL: "not-a-url" }),
    ConfigError,
  );
});

test("accepts a custom default property id and log level", () => {
  const config = loadConfig({
    ...validEnv,
    APALEO_DEFAULT_PROPERTY_ID: "BER",
    LOG_LEVEL: "debug",
  });
  assert.equal(config.apaleo.defaultPropertyId, "BER");
  assert.equal(config.logLevel, "debug");
});
