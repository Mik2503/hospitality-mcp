/** Mews-specific errors. Never carry tokens or secrets in their messages. */

export class MewsApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`Mews API error ${status}: ${message}`);
    this.name = "MewsApiError";
    this.status = status;
  }
}
