import type { DnpPayload, Logger, NegotiationParameters, Result } from '@declr/dnp-protocol';
import { err, ok } from '@declr/dnp-protocol';
import { parametersWithinStrategies, type BoundsViolation } from './bounds.js';
import type { NegotiationStrategy } from './negotiation-strategy.js';
import type { StrategyDecision } from './negotiation-strategy.js';
import type { StrategyContext } from './strategy-context.js';

export type OrchestratorVerdict =
  | { readonly kind: 'all_parameters_acceptable' }
  | { readonly kind: 'needs_counter'; readonly parameters: NegotiationParameters };

export type OrchestratorFailure =
  | BoundsViolation
  | {
      readonly kind: 'strategy_non_accept_outcome_not_handled_yet';
      readonly strategyParameter: NegotiationStrategy['parameterId'];
      readonly decision: StrategyDecision;
    };

/**
 * Composes individual parameter strategies for bilateral v0.1 demos.
 *
 * This is intentionally minimal: it either accepts the inbound map or suggests
 * a counter by applying the first rejecting strategy's proposal stub.
 */
export class NegotiationOrchestrator {
  constructor(
    private readonly strategies: readonly NegotiationStrategy[],
    private readonly logger: Logger,
  ) {}

  /**
   * Evaluates inbound parameters after structural validation has succeeded.
   */
  evaluateInbound(payload: DnpPayload): Result<OrchestratorVerdict, OrchestratorFailure> {
    const within = parametersWithinStrategies(payload.negotiationState.parameters, this.strategies);
    if (!within.ok) {
      this.logger.warn('Inbound parameters violate strategy bounds', {
        parameterId: within.error.parameterId,
      });
      return err(within.error);
    }

    const ctx: StrategyContext = { roundNumber: payload.negotiationState.roundNumber };

    /** Start from full stateless copy; strategies may tweak one slot only in this demo. */
    const nextBaseline: NegotiationParameters = { ...payload.negotiationState.parameters };

    for (const s of this.strategies) {
      const value = payload.negotiationState.parameters[s.parameterId];
      const decision = s.evaluateInbound(value, ctx);
      if (decision.action === 'reject' || decision.action === 'escalate') {
        this.logger.warn('Strategy requested outcome not yet mapped to outbound DNP', {
          strategy: s.parameterId,
          outcome: decision.action,
        });
        return err({
          kind: 'strategy_non_accept_outcome_not_handled_yet',
          strategyParameter: s.parameterId,
          decision,
        });
      }
      if (decision.action === 'counter') {
        const next = mergeCounter(nextBaseline, s.parameterId, decision.proposed);
        return ok({ kind: 'needs_counter', parameters: next });
      }
    }

    return ok({ kind: 'all_parameters_acceptable' });
  }
}

function mergeCounter(
  baseline: NegotiationParameters,
  id: keyof NegotiationParameters,
  proposed: unknown,
): NegotiationParameters {
  switch (id) {
    case 'price': {
      if (
        proposed &&
        typeof proposed === 'object' &&
        'value' in proposed &&
        'currency' in proposed
      ) {
        const o = proposed as { value?: unknown; currency?: unknown };
        const v = o.value;
        const c = o.currency;
        if (typeof v === 'number' && typeof c === 'string') {
          return { ...baseline, price: { value: v, currency: c } };
        }
      }
      return baseline;
    }
    case 'deliverySpeedDays': {
      if (proposed && typeof proposed === 'object' && 'min' in proposed && 'max' in proposed) {
        const o = proposed as { min?: unknown; max?: unknown };
        const min = o.min;
        const max = o.max;
        if (typeof min === 'number' && typeof max === 'number') {
          return { ...baseline, deliverySpeedDays: { min, max } };
        }
      }
      return baseline;
    }
    case 'deliveryMethod': {
      if (proposed === 'postal' || proposed === 'hand_deliver' || proposed === 'courier') {
        return { ...baseline, deliveryMethod: proposed };
      }
      return baseline;
    }
    case 'quantity':
      return typeof proposed === 'number' ? { ...baseline, quantity: proposed } : baseline;
    default:
      return baseline;
  }
}
