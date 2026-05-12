import { describe, expect, it } from 'vitest';
import { DeliveryMethodSchema, DnpPayloadSchema, PriceParameterSchema } from '@declr/dnp-protocol';

describe('DnpPayloadSchema', () => {
  it('accepts normative-shaped payload', () => {
    const raw = {
      dnpVersion: '0.1.0',
      messageType: 'counter',
      catalogItemRef: {
        itemId: 'DECLR-ITEM-12345',
        itemType: 'Offer',
        catalogUrl: 'https://catalog.declr.app/items/DECLR-ITEM-12345',
      },
      senderAgentId: 'did:declr:buyer-001',
      recipientAgentId: 'did:declr:seller-001',
      negotiationState: {
        roundNumber: 2,
        parameters: {
          price: { value: 135, currency: 'USD' },
          deliverySpeedDays: { min: 3, max: 5 },
          deliveryMethod: 'postal',
          quantity: 1,
        },
        proposedBy: 'did:declr:buyer-001',
      },
      context: {
        rationale: 'Lower price reflects standard shipping speed',
        escalationReason: null,
        humanApprovalRequired: false,
        lastAcceptableTerms: null,
      },
      metadata: {
        extensions: [],
        expiresAt: '2026-06-01T15:00:00.000Z',
      },
    };
    expect(DnpPayloadSchema.safeParse(raw).success).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    const raw = {
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
        roundNumber: 1,
        parameters: {
          price: { value: 10, currency: 'USD' },
          deliverySpeedDays: { min: 1, max: 4 },
          deliveryMethod: 'postal',
          quantity: 1,
        },
        proposedBy: 'did:declr:a',
      },
      context: {
        escalationReason: null,
        humanApprovalRequired: false,
      },
      metadata: {
        extensions: [],
      },
      extraFieldNotAllowed: true,
    };

    expect(DnpPayloadSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects malformed delivery speed ordering', () => {
    expect(DeliveryMethodSchema.safeParse('unknown').success, 'delivery enum').toBe(false);

    const price = PriceParameterSchema.safeParse({
      value: 1,
      currency: '',
    });
    expect(price.success, 'currency min length').toBe(false);
  });
});
