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
import { buildAutomatedSellerReply, withAgentSwap } from '@declr/dnp-agent';

/** Strategy that always counters with a fixed quantity, used to exercise the counter path. */
class FixedQtyCounterStrategy extends NegotiationStrategy {
  readonly parameterId = 'quantity' as const;
  constructor(private readonly targetQty: number) {
    super();
  }
  isWithinBounds(): boolean {
    return true;
  }
  evaluateInbound(
    _value: NegotiationParameters['quantity'],
    _ctx: StrategyContext,
  ): StrategyDecision {
    return { action: 'counter', proposed: this.targetQty };
  }
}

const baseProposal: DnpPayload = {
  dnpVersion: '0.1.0',
  messageType: 'proposal',
  catalogItemRef: {
    itemId: 'ITEM-1',
    itemType: 'Offer',
    catalogUrl: 'https://catalog.example.com/ITEM-1',
  },
  senderAgentId: 'did:declr:buyer',
  recipientAgentId: 'did:declr:seller',
  negotiationState: {
    roundNumber: 1,
    parameters: {
      price: { value: 135, currency: 'USD' },
      deliverySpeedDays: { min: 3, max: 5 },
      deliveryMethod: 'postal',
      quantity: 2,
    },
    proposedBy: 'did:declr:buyer',
  },
  context: { escalationReason: null, humanApprovalRequired: false },
  metadata: { extensions: [] },
};

function sellerOrchestrator(): NegotiationOrchestrator {
  return new NegotiationOrchestrator(
    [
      new PriceNegotiationStrategy({ min: 100, max: 140 }),
      new DeliverySpeedNegotiationStrategy({ minDays: 1, maxDays: 10 }),
      new DeliveryMethodNegotiationStrategy(new Set(['postal', 'courier'])),
      new QuantityNegotiationStrategy(1, 10),
    ],
    noopLogger,
  );
}

describe('Full negotiation cycle', () => {
  it('accepts proposal when all parameters are within seller bounds', () => {
    const reply = buildAutomatedSellerReply(baseProposal, sellerOrchestrator());
    expect(reply.kind).toBe('dnp');
    if (reply.kind === 'dnp') {
      expect(reply.dnp.messageType).toBe('accept');
      expect(reply.dnp.senderAgentId).toBe('did:declr:seller');
      expect(reply.dnp.recipientAgentId).toBe('did:declr:buyer');
      expect(reply.dnp.negotiationState.roundNumber).toBe(2);
    }
  });

  it('rejects proposal when price is below seller floor', () => {
    const lowPriceProposal: DnpPayload = {
      ...baseProposal,
      negotiationState: {
        ...baseProposal.negotiationState,
        parameters: {
          ...baseProposal.negotiationState.parameters,
          price: { value: 50, currency: 'USD' },
        },
      },
    };
    const reply = buildAutomatedSellerReply(lowPriceProposal, sellerOrchestrator());
    expect(reply.kind).toBe('dnp');
    if (reply.kind === 'dnp') {
      expect(reply.dnp.messageType).toBe('reject');
    }
  });

  it('counters on quantity and buyer can accept the adjusted terms on round 2', () => {
    // Seller uses a custom strategy that always counters quantity to 5
    const orch = new NegotiationOrchestrator(
      [
        new PriceNegotiationStrategy({ min: 100, max: 140 }),
        new DeliverySpeedNegotiationStrategy({ minDays: 1, maxDays: 10 }),
        new DeliveryMethodNegotiationStrategy(new Set(['postal', 'courier'])),
        new QuantityNegotiationStrategy(1, 10),
        new FixedQtyCounterStrategy(5),
      ],
      noopLogger,
    );

    const sellerReply = buildAutomatedSellerReply(baseProposal, orch);
    expect(sellerReply.kind).toBe('dnp');
    if (sellerReply.kind !== 'dnp') return;
    expect(sellerReply.dnp.messageType).toBe('counter');
    expect(sellerReply.dnp.negotiationState.parameters.quantity).toBe(5);
    expect(sellerReply.dnp.negotiationState.roundNumber).toBe(2);

    // Buyer accepts the counter on round 3
    const buyerAccept: DnpPayload = withAgentSwap(sellerReply.dnp, {
      messageType: 'accept',
      negotiationState: {
        ...sellerReply.dnp.negotiationState,
        roundNumber: sellerReply.dnp.negotiationState.roundNumber + 1,
      },
    });
    expect(buyerAccept.messageType).toBe('accept');
    expect(buyerAccept.negotiationState.roundNumber).toBe(3);
    expect(buyerAccept.senderAgentId).toBe('did:declr:buyer');
  });

  it('round numbers increment monotonically across a multi-round exchange', () => {
    // Use a counter-producing orchestrator for both rounds
    const makeOrch = () =>
      new NegotiationOrchestrator(
        [
          new PriceNegotiationStrategy({ min: 100, max: 140 }),
          new DeliverySpeedNegotiationStrategy({ minDays: 1, maxDays: 10 }),
          new DeliveryMethodNegotiationStrategy(new Set(['postal', 'courier'])),
          new QuantityNegotiationStrategy(1, 10),
          new FixedQtyCounterStrategy(5),
        ],
        noopLogger,
      );

    const r1 = buildAutomatedSellerReply(baseProposal, makeOrch());
    expect(r1.kind).toBe('dnp');
    if (r1.kind !== 'dnp') return;
    expect(r1.dnp.negotiationState.roundNumber).toBe(2);

    // Buyer sends a follow-up proposal at round 3
    const r2Proposal: DnpPayload = withAgentSwap(r1.dnp, {
      messageType: 'proposal',
      negotiationState: { ...r1.dnp.negotiationState, roundNumber: 3 },
    });
    const r2 = buildAutomatedSellerReply(r2Proposal, makeOrch());
    expect(r2.kind).toBe('dnp');
    if (r2.kind !== 'dnp') return;
    expect(r2.dnp.negotiationState.roundNumber).toBe(4);
  });
});
