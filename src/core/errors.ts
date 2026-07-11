/**
 * Domain-level (PMS-neutral) errors.
 *
 * Adapters throw these so the tool layer can react uniformly regardless of
 * which PMS is behind the interface.
 */

/** A requested entity (reservation, guest, property, ...) does not exist. */
export class NotFoundError extends Error {
  /** Kind of entity, e.g. `"reservation"`. */
  readonly resource: string;
  /** The identifier that was looked up. */
  readonly id: string;

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "NotFoundError";
    this.resource = resource;
    this.id = id;
  }
}

/**
 * The active PMS adapter does not support this capability (e.g. a PMS with no
 * housekeeping API). This is expected and not a bug — tools surface it as a
 * clear "not supported by this PMS" message.
 */
export class CapabilityNotSupportedError extends Error {
  readonly capability: string;

  constructor(capability: string, providerName: string) {
    super(`Capability "${capability}" is not supported by the ${providerName} adapter.`);
    this.name = "CapabilityNotSupportedError";
    this.capability = capability;
  }
}

/**
 * The caller asked for a write but writes are disabled, or provided invalid
 * input that the domain layer rejected before hitting the PMS.
 */
export class WriteNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteNotAllowedError";
  }
}
