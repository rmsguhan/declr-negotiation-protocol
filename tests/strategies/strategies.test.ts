import { describe, expect, it } from 'vitest';
import type { NegotiationParameters } from '@declr/dnp-protocol';
import { noopLogger } from '@declr/dnp-protocol';
import {
  DeliveryMethodNegotiationStrategy,
  DeliverySpeedNegotiationStrategy,
  PriceNegotiationStrategy,
  QuantityNegotiationStrategy,
} from '@declr/dnp-strategies';

const ctx = { roundNumber: 1 };

describe('PriceNegotiationStrategy', () => {
  const strategy = new PriceNegotiationStrategy({ min: 100, max: 200 });

  it('accepts value within bounds', () => {
    expect(strategy.isWithinBounds({ value: 150, currency: 'USD' })).toBe(true);
  });

  it('accepts value at exact min', () => {
    expect(strategy.isWithinBounds({ value: 100, currency: 'USD' })).toBe(true);
  });

  it('accepts value at exact max', () => {
    expect(strategy.isWithinBounds({ value: 200, currency: 'USD' })).toBe(true);
  });

  it('rejects value below min', () => {
    expect(strategy.isWithinBounds({ value: 99, currency: 'USD' })).toBe(false);
  });

  it('rejects value above max', () => {
    expect(strategy.isWithinBounds({ value: 201, currency: 'USD' })).toBe(false);
  });

  it('evaluateInbound returns accept when within bounds', () => {
    const d = strategy.evaluateInbound({ value: 150, currency: 'USD' }, ctx);
    expect(d.action).toBe('accept');
  });

  it('evaluateInbound returns counter at max when below min', () => {
    const d = strategy.evaluateInbound({ value: 50, currency: 'USD' }, ctx);
    expect(d.action).toBe('counter');
    if (d.action === 'counter') {
      expect((d.proposed as NegotiationParameters['price']).value).toBe(200);
      expect((d.proposed as NegotiationParameters['price']).currency).toBe('USD');
    }
  });
});

describe('DeliverySpeedNegotiationStrategy', () => {
  const strategy = new DeliverySpeedNegotiationStrategy({ minDays: 2, maxDays: 7 });

  it('accepts range within bounds', () => {
    expect(strategy.isWithinBounds({ min: 3, max: 5 })).toBe(true);
  });

  it('accepts range at exact bounds', () => {
    expect(strategy.isWithinBounds({ min: 2, max: 7 })).toBe(true);
  });

  it('rejects min below floor', () => {
    expect(strategy.isWithinBounds({ min: 1, max: 5 })).toBe(false);
  });

  it('rejects max above ceiling', () => {
    expect(strategy.isWithinBounds({ min: 3, max: 10 })).toBe(false);
  });

  it('rejects inverted range (min > max)', () => {
    expect(strategy.isWithinBounds({ min: 6, max: 3 })).toBe(false);
  });

  it('evaluateInbound returns counter with strategy bounds when out of range', () => {
    const d = strategy.evaluateInbound({ min: 1, max: 20 }, ctx);
    expect(d.action).toBe('counter');
    if (d.action === 'counter') {
      expect((d.proposed as NegotiationParameters['deliverySpeedDays']).min).toBe(2);
      expect((d.proposed as NegotiationParameters['deliverySpeedDays']).max).toBe(7);
    }
  });
});

describe('DeliveryMethodNegotiationStrategy', () => {
  const strategy = new DeliveryMethodNegotiationStrategy(new Set(['postal', 'courier']));

  it('accepts allowed method', () => {
    expect(strategy.isWithinBounds('postal')).toBe(true);
    expect(strategy.isWithinBounds('courier')).toBe(true);
  });

  it('rejects disallowed method', () => {
    expect(strategy.isWithinBounds('hand_deliver')).toBe(false);
  });

  it('evaluateInbound counters with first allowed method when disallowed', () => {
    const d = strategy.evaluateInbound('hand_deliver', ctx);
    expect(d.action).toBe('counter');
    if (d.action === 'counter') {
      expect(['postal', 'courier']).toContain(d.proposed);
    }
  });

  it('evaluateInbound accepts allowed method', () => {
    expect(strategy.evaluateInbound('postal', ctx).action).toBe('accept');
  });
});

describe('QuantityNegotiationStrategy', () => {
  const strategy = new QuantityNegotiationStrategy(1, 10);

  it('accepts integer within bounds', () => {
    expect(strategy.isWithinBounds(5)).toBe(true);
  });

  it('accepts at min boundary', () => {
    expect(strategy.isWithinBounds(1)).toBe(true);
  });

  it('accepts at max boundary', () => {
    expect(strategy.isWithinBounds(10)).toBe(true);
  });

  it('rejects zero', () => {
    expect(strategy.isWithinBounds(0)).toBe(false);
  });

  it('rejects above max', () => {
    expect(strategy.isWithinBounds(11)).toBe(false);
  });

  it('rejects non-integer', () => {
    expect(strategy.isWithinBounds(2.5)).toBe(false);
  });

  it('evaluateInbound counters with maxQty when out of bounds', () => {
    const d = strategy.evaluateInbound(50, ctx);
    expect(d.action).toBe('counter');
    if (d.action === 'counter') {
      expect(d.proposed).toBe(10);
    }
  });

  it('evaluateInbound accepts in-bounds quantity', () => {
    expect(strategy.evaluateInbound(3, ctx).action).toBe('accept');
  });
});

describe('NegotiationOrchestrator — strategy_proposed_invalid_value', () => {
  it('surfaces error when a strategy proposes a structurally invalid value', async () => {
    const { NegotiationOrchestrator, NegotiationStrategy } = await import('@declr/dnp-strategies');

    class BrokenPriceStrategy extends NegotiationStrategy {
      readonly parameterId = 'price' as const;
      // Passes bounds check so the orchestrator proceeds to evaluateInbound
      isWithinBounds(): boolean {
        return true;
      }
      evaluateInbound() {
        return { action: 'counter' as const, proposed: 'not-a-price-object' };
      }
    }

    const orch = new NegotiationOrchestrator([new BrokenPriceStrategy()], noopLogger);
    const result = orch.evaluateInbound({
      dnpVersion: '0.1.0',
      messageType: 'proposal',
      catalogItemRef: { itemId: 'X', itemType: 'Offer', catalogUrl: 'https://example.com/x' },
      senderAgentId: 'did:declr:a',
      recipientAgentId: 'did:declr:b',
      negotiationState: {
        roundNumber: 1,
        parameters: {
          price: { value: 50, currency: 'USD' },
          deliverySpeedDays: { min: 1, max: 3 },
          deliveryMethod: 'postal',
          quantity: 1,
        },
        proposedBy: 'did:declr:a',
      },
      context: { escalationReason: null, humanApprovalRequired: false },
      metadata: { extensions: [] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('strategy_proposed_invalid_value');
      expect(result.error.strategyParameter).toBe('price');
    }
  });
});
