import { describe, expect, it } from 'vitest';
import {
  parseDnpPayloadWithNegotiationContext,
  validateExpiresAt,
  validateRoundMonotonic,
} from '@declr/dnp-protocol';

const minimalPayload = {
  dnpVersion: '0.1.0',
  messageType: 'proposal',
  catalogItemRef: {
    itemId: 'DECLR-ITEM-12345',
    itemType: 'Offer',
    catalogUrl: 'https://catalog.declr.app/items/DECLR-ITEM-12345',
  },
  senderAgentId: 'did:declr:a',
  recipientAgentId: 'did:declr:b',
  negotiationState: {
    roundNumber: 2,
    parameters: {
      price: { value: 120, currency: 'USD' },
      deliverySpeedDays: { min: 2, max: 7 },
      deliveryMethod: 'postal' as const,
      quantity: 1,
    },
    proposedBy: 'did:declr:a',
  },
  context: {
    escalationReason: null as string | null,
    humanApprovalRequired: false,
  },
  metadata: {
    extensions: [] as unknown[],
    expiresAt: '2030-01-01T00:00:00.000Z',
  },
};

describe('validateRoundMonotonic', () => {
  it('allows the first inbound round without history', () => {
    const r = validateRoundMonotonic(undefined, 1);
    expect(r.ok).toBe(true);
  });

  it('allows a strictly increasing round', () => {
    const r = validateRoundMonotonic(2, 3);
    expect(r.ok).toBe(true);
  });

  it('rejects non-increasing rounds (same number)', () => {
    const r = validateRoundMonotonic(3, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('round_not_strictly_increasing');
  });

  it('rejects a regressed round', () => {
    const r = validateRoundMonotonic(5, 3);
    expect(r.ok).toBe(false);
  });

  it('rejects round 0', () => {
    const r = validateRoundMonotonic(undefined, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('round_non_positive');
  });

  it('rejects negative round', () => {
    const r = validateRoundMonotonic(undefined, -1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('round_non_positive');
  });
});

describe('validateExpiresAt', () => {
  it('is a no-op when omitted', () => {
    expect(validateExpiresAt(undefined, Date.now()).ok).toBe(true);
  });

  it('accepts a timestamp in the future', () => {
    const futureMs = Date.now() + 60_000;
    const r = validateExpiresAt(new Date(futureMs).toISOString(), Date.now());
    expect(r.ok).toBe(true);
  });

  it('rejects a timestamp in the past', () => {
    const pastMs = Date.now() - 60_000;
    const r = validateExpiresAt(new Date(pastMs).toISOString(), Date.now());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('expires_at_in_past');
    }
  });

  it('rejects a non-ISO string', () => {
    const r = validateExpiresAt('not-a-date', Date.now());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('expires_at_invalid_iso');
    }
  });
});

describe('parseDnpPayloadWithNegotiationContext', () => {
  it('parses payload and enforces rounds', () => {
    const failure = parseDnpPayloadWithNegotiationContext(minimalPayload, {
      priorRound: 5,
    });
    expect(failure.ok).toBe(false);
  });

  it('parses OK when strictly increasing vs priorRound', () => {
    const okResult = parseDnpPayloadWithNegotiationContext(minimalPayload, {
      priorRound: 1,
      nowMs: new Date('2020-01-01T00:00:00Z').valueOf(),
    });
    expect(okResult.ok).toBe(true);
  });
});
