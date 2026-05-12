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

  it('rejects non-increasing rounds', () => {
    const r = validateRoundMonotonic(3, 3);
    expect(r.ok).toBe(false);
  });
});

describe('validateExpiresAt', () => {
  it('is a no-op when omitted', () => {
    expect(validateExpiresAt(undefined, Date.now()).ok).toBe(true);
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
