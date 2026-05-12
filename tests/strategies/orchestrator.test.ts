import { describe, expect, it } from 'vitest';
import type { DnpPayload, NegotiationParameters } from '@declr/dnp-protocol';
import { noopLogger } from '@declr/dnp-protocol';
import {
  DeliveryMethodNegotiationStrategy,
  DeliverySpeedNegotiationStrategy,
  NegotiationOrchestrator,
  NegotiationStrategy,
  PriceNegotiationStrategy,
  QuantityNegotiationStrategy,
  type StrategyContext,
  type StrategyDecision,
} from '@declr/dnp-strategies';

class QuantityCounterStrategy extends NegotiationStrategy {
  readonly parameterId = 'quantity' as const;

  constructor(private readonly qty: NegotiationParameters['quantity']) {
    super();
  }

  isWithinBounds(value: NegotiationParameters['quantity']): boolean {
    void value;
    return true;
  }

  evaluateInbound(
    _value: NegotiationParameters['quantity'],
    _ctx: StrategyContext,
  ): StrategyDecision {
    void _value;
    void _ctx;
    return { action: 'counter', proposed: this.qty };
  }
}

const basePayload = {
  dnpVersion: '0.1.0',
  messageType: 'proposal' as const,
  catalogItemRef: {
    itemId: 'DECLR',
    itemType: 'Offer' as const,
    catalogUrl: 'https://catalog.declr.app/items/DECLR',
  },
  senderAgentId: 'did:declr:b',
  recipientAgentId: 'did:declr:s',
  negotiationState: {
    roundNumber: 1,
    parameters: {
      price: { value: 135, currency: 'USD' },
      deliverySpeedDays: { min: 3, max: 5 },
      deliveryMethod: 'postal' as const,
      quantity: 1,
    },
    proposedBy: 'did:declr:b',
  },
  context: {
    escalationReason: null,
    humanApprovalRequired: false,
  },
  metadata: {
    extensions: [],
  },
} as const satisfies DnpPayload;

describe('NegotiationOrchestrator', () => {
  const price = new PriceNegotiationStrategy({ min: 100, max: 140 });
  const speed = new DeliverySpeedNegotiationStrategy({ minDays: 1, maxDays: 10 });
  const dm = new DeliveryMethodNegotiationStrategy(new Set(['postal', 'courier']));
  const qty = new QuantityNegotiationStrategy(1, 10);

  it('surfaces a formal reject verdict when coarse bounds fail (e.g. price below seller floor)', () => {
    const orch = new NegotiationOrchestrator([price, speed, dm, qty], noopLogger);
    const verdict = orch.evaluateInbound({
      ...basePayload,
      negotiationState: {
        ...basePayload.negotiationState,
        parameters: {
          ...basePayload.negotiationState.parameters,
          price: { value: 50, currency: 'USD' },
        },
      },
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.value.kind).toBe('needs_reject');
      if (verdict.value.kind === 'needs_reject') {
        expect(verdict.value.violation.kind).toBe('parameter_out_of_bounds');
        expect(verdict.value.violation.parameterId).toBe('price');
      }
    }
  });

  it('accepts feasible parameters when every strategy agrees', () => {
    const orch = new NegotiationOrchestrator([price, speed, dm, qty], noopLogger);
    const okResult = orch.evaluateInbound({ ...basePayload });
    expect(okResult.ok && okResult.value.kind).toBe('all_parameters_acceptable');
  });

  it('surfaces deterministic counters via strategy proposals', () => {
    const orch = new NegotiationOrchestrator(
      [qty, price, speed, dm, new QuantityCounterStrategy(2)],
      noopLogger,
    );
    const queued = orch.evaluateInbound({ ...basePayload });
    /** QuantityCounterStrategy appended last orchestrates after qty strategy accepts. */
    expect(queued.ok && queued.value.kind === 'needs_counter').toBe(true);
    if (queued.ok && queued.value.kind === 'needs_counter') {
      expect(queued.value.parameters.quantity).toBe(2);
    }
  });
});
