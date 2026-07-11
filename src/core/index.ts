/**
 * Public surface of the normalized core: domain types, query/input types,
 * the PMS adapter contract, and domain errors.
 *
 * Tools and adapters import from here (`../core/index.js`) rather than reaching
 * into individual files.
 */

export * from "./domain.js";
export * from "./queries.js";
export * from "./adapter.js";
export * from "./errors.js";
