/** Runtime context forwarded to deterministic strategies during evaluation. */

export interface StrategyContext {
  /** Monotonic negotiation round from the inbound message. */
  readonly roundNumber: number;
}
