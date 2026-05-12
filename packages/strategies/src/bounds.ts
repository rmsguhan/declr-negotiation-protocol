import type { NegotiationParameters, Result } from '@declr/dnp-protocol';
import { err, ok } from '@declr/dnp-protocol';
import type { NegotiationStrategy } from './negotiation-strategy.js';

export type BoundsViolation = {
  readonly kind: 'parameter_out_of_bounds';
  readonly parameterId: NegotiationStrategy['parameterId'];
};

/**
 * Checks every registered strategy against the full (stateless) parameter map.
 */
export function parametersWithinStrategies(
  parameters: NegotiationParameters,
  strategies: readonly NegotiationStrategy[],
): Result<void, BoundsViolation> {
  for (const s of strategies) {
    const value = parameters[s.parameterId];
    if (!s.isWithinBounds(value)) {
      return err({ kind: 'parameter_out_of_bounds', parameterId: s.parameterId });
    }
  }
  return ok(undefined);
}
