import type { ZodIssue } from 'zod';
import type { Result } from './result.js';
import { err, ok } from './result.js';
import type { DnpValidationError } from './errors.js';
import { DnpPayloadSchema, type DnpPayload } from './schemas.js';

/** Parse and validate structural shape of an unknown payload. Does not check TTL. */
export function parseDnpPayload(data: unknown): Result<DnpPayload, DnpValidationError> {
  const parsed = DnpPayloadSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      kind: 'schema_unparseable_payload',
      issues: parsed.error.issues.map((issue: ZodIssue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }
  return ok(parsed.data);
}

/**
 * Validate `metadata.expiresAt` when provided; rejects expired messages using `nowMs`.
 *
 * Stateless messages still carry TTL as per spec — agents should call this before acting.
 */
export function validateExpiresAt(
  expiresAt: string | undefined,
  nowMs: number,
): Result<void, DnpValidationError> {
  const failure = expiresIfInvalid(expiresAt, nowMs);
  return failure ? err(failure) : ok(undefined);
}

function expiresIfInvalid(
  expiresAt: string | undefined,
  nowMs: number,
): DnpValidationError | undefined {
  if (expiresAt === undefined) {
    return undefined;
  }
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) {
    return { kind: 'expires_at_invalid_iso', expiresAt };
  }
  if (parsed <= nowMs) {
    return { kind: 'expires_at_in_past', expiresAt, nowMs };
  }
  return undefined;
}

/**
 * Ensures strictly increasing rounds for a single negotiation (`contextId` in transport).
 *
 * @param previousRound — highest round observed for this negotiation, if any.
 * @param incoming — `negotiationState.roundNumber` on the inbound message.
 */
export function validateRoundMonotonic(
  previousRound: number | undefined,
  incoming: number,
): Result<void, DnpValidationError> {
  if (!Number.isInteger(incoming) || incoming < 1) {
    return err({ kind: 'round_non_positive', roundNumber: incoming });
  }
  if (previousRound === undefined) {
    return ok(undefined);
  }
  if (incoming <= previousRound) {
    return err({
      kind: 'round_not_strictly_increasing',
      previous: previousRound,
      incoming,
    });
  }
  return ok(undefined);
}

/**
 * Convenience: structural parse plus optional monotonic-round check.
 * TTL is enforced when `metadata.expiresAt` is present.
 */
export function parseDnpPayloadWithNegotiationContext(
  data: unknown,
  options?: { readonly priorRound?: number | undefined; readonly nowMs?: number },
): Result<DnpPayload, DnpValidationError> {
  const base = parseDnpPayload(data);
  if (!base.ok) {
    return base;
  }
  const exp = expiresIfInvalid(base.value.metadata.expiresAt, options?.nowMs ?? Date.now());
  if (exp) {
    return err(exp);
  }
  const round = validateRoundMonotonic(
    options?.priorRound,
    base.value.negotiationState.roundNumber,
  );
  if (!round.ok) {
    return round;
  }
  return base;
}
