import type { NegotiationParameters } from '@declr/dnp-protocol';
import type { StrategyContext } from './strategy-context.js';

/** Parameter slot identifiers for v0.1. */
export type NegotiationParameterId = keyof NegotiationParameters;

export type StrategyDecision =
  | { readonly action: 'accept' }
  /** Deterministic tweak for a single parameter slot handled by merge logic. */
  | { readonly action: 'counter'; readonly proposed: unknown }
  | { readonly action: 'reject' }
  | { readonly action: 'escalate'; readonly reason: string };

/**
 * Abstract, rule-based strategy for a single negotiation parameter.
 * Implementations must stay deterministic (no randomness or model calls).
 */
export abstract class NegotiationStrategy {
  /** Which slot in {@link NegotiationParameters} this strategy governs. */
  abstract readonly parameterId: NegotiationParameterId;

  /** Returns whether the inbound value satisfies local bounds/policy. */
  abstract isWithinBounds(
    value: NegotiationParameters[NegotiationStrategy['parameterId']],
  ): boolean;

  /** Lightweight evaluation hook used by orchestrator demos. */
  abstract evaluateInbound(
    value: NegotiationParameters[NegotiationStrategy['parameterId']],
    ctx: StrategyContext,
  ): StrategyDecision;
}
