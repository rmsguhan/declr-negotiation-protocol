import type { DnpPayload, Logger, NegotiationParameters, Result } from '@declr/dnp-protocol';
import {
  DeliveryMethodSchema,
  DeliverySpeedParameterSchema,
  NegotiationParametersSchema,
  PriceParameterSchema,
  err,
  ok,
} from '@declr/dnp-protocol';
import { parametersWithinStrategies, type BoundsViolation } from './bounds.js';
import type { NegotiationStrategy, StrategyDecision } from './negotiation-strategy.js';
import type { StrategyContext } from './strategy-context.js';

export type OrchestratorVerdict =
  | { readonly kind: 'all_parameters_acceptable' }
  | { readonly kind: 'needs_counter'; readonly parameters: NegotiationParameters }
  | { readonly kind: 'needs_reject'; readonly violation: BoundsViolation };

export type OrchestratorFailure =
  | {
      readonly kind: 'strategy_non_accept_outcome_not_handled_yet';
      readonly strategyParameter: NegotiationStrategy['parameterId'];
      readonly decision: StrategyDecision;
    }
  | {
      readonly kind: 'strategy_proposed_invalid_value';
      readonly strategyParameter: NegotiationStrategy['parameterId'];
      readonly proposed: unknown;
    };

/**
 * Composes individual parameter strategies for bilateral v0.1 demos.
 *
 * Outcomes: accept all parameters, counter with adjusted parameters, or (when coarse
 * bounds fail) a formal `needs_reject` verdict for threshold-based decline.
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
      this.logger.warn(
        'Inbound parameters violate strategy bounds — will surface as formal reject',
        {
          parameterId: within.error.parameterId,
        },
      );
      return ok({ kind: 'needs_reject', violation: within.error });
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
        if (next === undefined) {
          this.logger.warn('Strategy proposed an invalid value for parameter', {
            parameterId: s.parameterId,
            proposed: decision.proposed,
          });
          return err({
            kind: 'strategy_proposed_invalid_value',
            strategyParameter: s.parameterId,
            proposed: decision.proposed,
          });
        }
        return ok({ kind: 'needs_counter', parameters: next });
      }
    }

    return ok({ kind: 'all_parameters_acceptable' });
  }
}

/** Returns undefined when `proposed` does not conform to the parameter's schema. */
function mergeCounter(
  baseline: NegotiationParameters,
  id: keyof NegotiationParameters,
  proposed: unknown,
): NegotiationParameters | undefined {
  switch (id) {
    case 'price': {
      const r = PriceParameterSchema.safeParse(proposed);
      return r.success ? { ...baseline, price: r.data } : undefined;
    }
    case 'deliverySpeedDays': {
      const r = DeliverySpeedParameterSchema.safeParse(proposed);
      return r.success ? { ...baseline, deliverySpeedDays: r.data } : undefined;
    }
    case 'deliveryMethod': {
      const r = DeliveryMethodSchema.safeParse(proposed);
      return r.success ? { ...baseline, deliveryMethod: r.data } : undefined;
    }
    case 'quantity': {
      const r = NegotiationParametersSchema.shape.quantity.safeParse(proposed);
      return r.success ? { ...baseline, quantity: r.data } : undefined;
    }
    default:
      return baseline;
  }
}
