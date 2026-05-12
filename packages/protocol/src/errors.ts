/** Shape validation failure from Zod. */
export type SchemaValidationError = {
  readonly kind: 'schema_unparseable_payload';
  readonly issues: readonly { path: readonly (string | number)[]; message: string }[];
};

/** Monotonic-round gate for a negotiation (same A2A `contextId`). */
export type RoundViolationError =
  | { readonly kind: 'round_non_positive'; readonly roundNumber: number }
  | {
      readonly kind: 'round_not_strictly_increasing';
      readonly previous: number;
      readonly incoming: number;
    };

/** TTL check for `metadata.expiresAt`. */
export type ExpiresAtViolationError =
  | { readonly kind: 'expires_at_invalid_iso'; readonly expiresAt: string }
  | { readonly kind: 'expires_at_in_past'; readonly expiresAt: string; readonly nowMs: number };

export type DnpValidationError =
  | SchemaValidationError
  | RoundViolationError
  | ExpiresAtViolationError;
