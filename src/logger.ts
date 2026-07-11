/**
 * Minimal leveled logger.
 *
 * IMPORTANT: all output goes to STDERR. When the server runs over the MCP stdio
 * transport, STDOUT is reserved for the JSON-RPC protocol — writing logs there
 * would corrupt the stream. Never log to stdout.
 *
 * This logger never redacts for you. Do not pass secrets or tokens to it; use
 * the helpers in `util/redact.ts` at the call site when a value might be
 * sensitive.
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export function createLogger(level: LogLevel = "info"): Logger {
  const threshold = LEVEL_ORDER[level];

  function log(msgLevel: LogLevel, message: string, args: unknown[]): void {
    if (LEVEL_ORDER[msgLevel] > threshold) return;
    const line = `[hospitality-mcp] ${msgLevel.toUpperCase()} ${message}`;
    // eslint-disable-next-line no-console -- stderr only, see file header
    console.error(line, ...args);
  }

  return {
    error: (message, ...args) => log("error", message, args),
    warn: (message, ...args) => log("warn", message, args),
    info: (message, ...args) => log("info", message, args),
    debug: (message, ...args) => log("debug", message, args),
  };
}
