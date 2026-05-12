import type { NegotiationParameters } from '@declr/dnp-protocol';
import { NegotiationStrategy, type StrategyDecision } from './negotiation-strategy.js';
import type { StrategyContext } from './strategy-context.js';

export interface PriceStrategyBounds {
  readonly min: number;
  readonly max: number;
}

/**
 * Validates `NegotiationParameters['price']` against absolute min/max totals.
 *
 * Bounds are deliberately simple for v0.1 reference code; production agents
 * should derive these from catalog offers and buyer demands.
 */
export class PriceNegotiationStrategy extends NegotiationStrategy {
  readonly parameterId = 'price' as const;

  constructor(private readonly bounds: PriceStrategyBounds) {
    super();
  }

  isWithinBounds(value: NegotiationParameters['price']): boolean {
    return value.value >= this.bounds.min && value.value <= this.bounds.max;
  }

  evaluateInbound(value: NegotiationParameters['price'], _ctx: StrategyContext): StrategyDecision {
    if (!this.isWithinBounds(value)) {
      return { action: 'counter', proposed: { value: this.bounds.max, currency: value.currency } };
    }
    return { action: 'accept' };
  }
}

export interface DeliverySpeedStrategyBounds {
  readonly minDays: number;
  readonly maxDays: number;
}

export class DeliverySpeedNegotiationStrategy extends NegotiationStrategy {
  readonly parameterId = 'deliverySpeedDays' as const;

  constructor(private readonly bounds: DeliverySpeedStrategyBounds) {
    super();
  }

  isWithinBounds(value: NegotiationParameters['deliverySpeedDays']): boolean {
    return (
      value.min >= this.bounds.minDays && value.max <= this.bounds.maxDays && value.min <= value.max
    );
  }

  evaluateInbound(
    value: NegotiationParameters['deliverySpeedDays'],
    _ctx: StrategyContext,
  ): StrategyDecision {
    if (!this.isWithinBounds(value)) {
      return {
        action: 'counter',
        proposed: { min: this.bounds.minDays, max: this.bounds.maxDays },
      };
    }
    return { action: 'accept' };
  }
}

export class DeliveryMethodNegotiationStrategy extends NegotiationStrategy {
  readonly parameterId = 'deliveryMethod' as const;

  constructor(private readonly allowed: ReadonlySet<NegotiationParameters['deliveryMethod']>) {
    super();
  }

  isWithinBounds(value: NegotiationParameters['deliveryMethod']): boolean {
    return this.allowed.has(value);
  }

  evaluateInbound(
    value: NegotiationParameters['deliveryMethod'],
    _ctx: StrategyContext,
  ): StrategyDecision {
    if (!this.isWithinBounds(value)) {
      const first = [...this.allowed][0];
      return { action: 'counter', proposed: first ?? value };
    }
    return { action: 'accept' };
  }
}

export class QuantityNegotiationStrategy extends NegotiationStrategy {
  readonly parameterId = 'quantity' as const;

  constructor(
    private readonly minQty: number,
    private readonly maxQty: number,
  ) {
    super();
  }

  isWithinBounds(value: NegotiationParameters['quantity']): boolean {
    return Number.isInteger(value) && value >= this.minQty && value <= this.maxQty;
  }

  evaluateInbound(
    value: NegotiationParameters['quantity'],
    _ctx: StrategyContext,
  ): StrategyDecision {
    if (!this.isWithinBounds(value)) {
      return { action: 'counter', proposed: this.maxQty };
    }
    return { action: 'accept' };
  }
}
