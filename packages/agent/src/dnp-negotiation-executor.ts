import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import type { Message } from '@a2a-js/sdk';
import type { DnpPayload, Logger } from '@declr/dnp-protocol';
import { parseDnpPayloadWithNegotiationContext } from '@declr/dnp-protocol';
import type { NegotiationOrchestrator } from '@declr/dnp-strategies';
import { randomUUID } from 'node:crypto';
import { extractDataPartRecords } from './extract-data-parts.js';

export type DnpExecutorOptions = {
  readonly logger: Logger;
  readonly orchestrator?: NegotiationOrchestrator;
  /**
   * Optional prior round persisted by the host (one negotiation = one task / `contextId`).
   * v0.1 demo leaves this undefined so only structural checks run.
   */
  priorRoundForNegotiation?: (
    contextId: string,
    taskId: string,
  ) => number | undefined | Promise<number | undefined>;
};

/** Map SDK `RequestContext` plus parsed DNP envelope. */
export type DnpAgentContext = {
  readonly requestContext: RequestContext;
  readonly dnp: DnpPayload;
};

/**
 * Default A2A executor: validates DNP in `DataPart`s, runs optional orchestration, responds in-kind.
 */
export class DnpNegotiationExecutor implements AgentExecutor {
  constructor(private readonly opts: DnpExecutorOptions) {}

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const message = requestContext.userMessage;
    const records = extractDataPartRecords(message);
    if (records.length === 0) {
      this.publishTextOnly(
        eventBus,
        requestContext,
        'Missing DNP payload: expected an A2A data part with structured JSON.',
      );
      return;
    }

    const merged: unknown = records[0];

    const prior =
      (await this.opts.priorRoundForNegotiation?.(
        requestContext.contextId,
        requestContext.taskId,
      )) ?? undefined;

    const parsed = parseDnpPayloadWithNegotiationContext(merged, { priorRound: prior });
    if (!parsed.ok) {
      this.opts.logger.warn('DNP envelope validation failed', {
        error: parsed.error,
        contextId: requestContext.contextId,
      });
      this.publishTextOnly(eventBus, requestContext, `DNP validation error: ${parsed.error.kind}`);
      return;
    }

    const dnp = parsed.value;
    this.opts.logger.info('Accepted DNP inbound', {
      contextId: requestContext.contextId,
      messageType: dnp.messageType,
      round: dnp.negotiationState.roundNumber,
    });

    if (this.opts.orchestrator) {
      const verdict = this.opts.orchestrator.evaluateInbound(dnp);
      if (!verdict.ok) {
        this.publishTextOnly(
          eventBus,
          requestContext,
          `Orchestrator rejection: ${JSON.stringify(verdict.error)}`,
        );
        return;
      }
      if (verdict.value.kind === 'needs_counter') {
        const counter: DnpPayload = withAgentSwap(dnp, {
          messageType: 'counter',
          negotiationState: {
            ...dnp.negotiationState,
            roundNumber: dnp.negotiationState.roundNumber + 1,
            parameters: verdict.value.parameters,
          },
        });
        this.publishDnp(eventBus, requestContext, counter, 'Deterministic counter-offer');
        return;
      }

      const accept: DnpPayload = withAgentSwap(dnp, {
        messageType: 'accept',
        negotiationState: {
          ...dnp.negotiationState,
          roundNumber: dnp.negotiationState.roundNumber + 1,
        },
      });
      this.publishDnp(eventBus, requestContext, accept, 'Accepting terms as proposed');
      return;
    }

    /** Fallback echo when no orchestrator is configured. */
    const echo: DnpPayload = withAgentSwap(dnp, {
      messageType: 'counter',
      negotiationState: {
        ...dnp.negotiationState,
        roundNumber: dnp.negotiationState.roundNumber + 1,
      },
    });
    this.publishDnp(eventBus, requestContext, echo, 'Echo counter (no orchestrator configured)');
  }

  cancelTask = async (): Promise<void> => {};

  private publishTextOnly(
    eventBus: ExecutionEventBus,
    requestContext: RequestContext,
    text: string,
  ): void {
    const response: Message = {
      kind: 'message',
      role: 'agent',
      messageId: randomUUID(),
      contextId: requestContext.contextId,
      parts: [{ kind: 'text', text }],
    };
    eventBus.publish(response);
    eventBus.finished();
  }

  private publishDnp(
    eventBus: ExecutionEventBus,
    requestContext: RequestContext,
    dnp: DnpPayload,
    rationale: string,
  ): void {
    const response: Message = {
      kind: 'message',
      role: 'agent',
      messageId: randomUUID(),
      contextId: requestContext.contextId,
      parts: [
        { kind: 'text', text: rationale },
        { kind: 'data', data: dnp as unknown as Record<string, unknown> },
      ],
    };
    eventBus.publish(response);
    eventBus.finished();
  }
}

function withAgentSwap(
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
