import type { DnpPayload } from '@declr/dnp-protocol';
import type { NegotiationOrchestrator } from '@declr/dnp-strategies';

export type AutomatedSellerReply =
  | { readonly kind: 'dnp'; readonly dnp: DnpPayload; readonly rationale: string }
  | { readonly kind: 'text_reject'; readonly text: string };

/**
 * Builds the same seller response shape as {@link DnpNegotiationExecutor} for a validated inbound DNP.
 */
export function buildAutomatedSellerReply(
  inbound: DnpPayload,
  orchestrator: NegotiationOrchestrator,
): AutomatedSellerReply {
  const verdict = orchestrator.evaluateInbound(inbound);
  if (!verdict.ok) {
    return {
      kind: 'text_reject',
      text: `Orchestrator rejection: ${JSON.stringify(verdict.error)}`,
    };
  }
  if (verdict.value.kind === 'needs_reject') {
    const { violation } = verdict.value;
    const rationale = `Reject: ${violation.parameterId} is outside the seller's acceptable bounds for this negotiation.`;
    const base = withAgentSwap(inbound, {
      messageType: 'reject',
      negotiationState: {
        ...inbound.negotiationState,
        roundNumber: inbound.negotiationState.roundNumber + 1,
      },
    });
    const dnp: DnpPayload = {
      ...base,
      context: {
        ...base.context,
        rationale: `${rationale} The seller cannot proceed with these terms under the configured strategy thresholds.`,
      },
    };
    return { kind: 'dnp', dnp, rationale };
  }
  if (verdict.value.kind === 'needs_counter') {
    const counter = withAgentSwap(inbound, {
      messageType: 'counter',
      negotiationState: {
        ...inbound.negotiationState,
        roundNumber: inbound.negotiationState.roundNumber + 1,
        parameters: verdict.value.parameters,
      },
    });
    return { kind: 'dnp', dnp: counter, rationale: 'Deterministic counter-offer' };
  }

  const accept = withAgentSwap(inbound, {
    messageType: 'accept',
    negotiationState: {
      ...inbound.negotiationState,
      roundNumber: inbound.negotiationState.roundNumber + 1,
    },
  });
  return { kind: 'dnp', dnp: accept, rationale: 'Accepting terms as proposed' };
}

/** Same as executor: responding agent becomes sender and proposer. */
export function withAgentSwap(
  inbound: DnpPayload,
  patch: Pick<DnpPayload, 'messageType' | 'negotiationState'>,
): DnpPayload {
  const proposedBy = inbound.recipientAgentId;
  const senderAgentId = inbound.recipientAgentId;
  const recipientAgentId = inbound.senderAgentId;

  return {
    ...inbound,
    ...patch,
    senderAgentId,
    recipientAgentId,
    negotiationState: {
      ...patch.negotiationState,
      proposedBy,
    },
  };
}
