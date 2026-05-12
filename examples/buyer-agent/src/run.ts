import { ClientFactory } from '@a2a-js/sdk/client';
import type { Message, MessageSendParams, Task } from '@a2a-js/sdk';
import { randomUUID } from 'node:crypto';
import type { DnpPayload } from '@declr/dnp-protocol';

async function pollUntil(fn: () => Promise<boolean>, attempts = 40, ms = 250): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if (await fn()) {
        return true;
      }
    } catch {
      /* retry until seller listens */
    }
    await new Promise<void>((r) => setTimeout(r, ms));
  }
  return false;
}

function findDnpData(message: Message): unknown {
  for (const part of message.parts) {
    if (part.kind === 'data') {
      return part.data;
    }
  }
  return undefined;
}

function lastAssistantMessageFromTask(task: Task): Message | undefined {
  const history = task.history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item === undefined) continue;
    if (item.role === 'agent') {
      return item;
    }
  }
  return undefined;
}

function summarizeAssistantMessage(candidate: Message | Task): Message | undefined {
  switch (candidate.kind) {
    case 'message':
      return candidate;
    case 'task':
      return lastAssistantMessageFromTask(candidate);
    default:
      return undefined;
  }
}

async function main(): Promise<void> {
  const sellerBase = process.env['SELLER_BASE_URL'] ?? 'http://127.0.0.1:4101';
  const cardUrl = `${sellerBase.replace(/\/$/, '')}/.well-known/agent-card.json`;

  const factory = new ClientFactory();

  const reachable = await pollUntil(async () => {
    const response = await fetch(cardUrl, { method: 'GET' });
    return response.ok;
  });
  if (!reachable) {
    throw new Error(`Seller did not expose an agent card at ${cardUrl}`);
  }

  const client = await factory.createFromUrl(sellerBase);

  const negotiationId = randomUUID();
  const buyerId = 'did:declr:buyer-demo';
  const sellerId = 'did:declr:seller-demo';

  const proposal: DnpPayload = {
    dnpVersion: '0.1.0',
    messageType: 'proposal',
    catalogItemRef: {
      itemId: 'DECLR-ITEM-DEMO',
      itemType: 'Offer',
      catalogUrl: 'https://catalog.declr.app/items/DECLR-ITEM-DEMO',
    },
    senderAgentId: buyerId,
    recipientAgentId: sellerId,
    negotiationState: {
      roundNumber: 1,
      parameters: {
        price: { value: 135, currency: 'USD' },
        deliverySpeedDays: { min: 3, max: 6 },
        deliveryMethod: 'postal',
        quantity: 1,
      },
      proposedBy: buyerId,
    },
    context: {
      rationale: 'Opening offer from Declr demo buyer.',
      escalationReason: null,
      humanApprovalRequired: false,
    },
    metadata: {
      extensions: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };

  const sendParams: MessageSendParams = {
    message: {
      kind: 'message',
      messageId: randomUUID(),
      role: 'user',
      contextId: negotiationId,
      parts: [
        { kind: 'text', text: 'DNP negotiation proposal payload' },
        { kind: 'data', data: proposal as unknown as Record<string, unknown> },
      ],
    },
  };

  console.info('[buyer] sending proposal …');
  const response = await client.sendMessage(sendParams);
  const agentMessage = summarizeAssistantMessage(response);

  if (!agentMessage) {
    console.info('[buyer] received non-message payload:', response);
    return;
  }

  console.info('[buyer] received Message from seller');
  const blob = findDnpData(agentMessage);
  const messageTypeUnknown: unknown =
    blob && typeof blob === 'object' && 'messageType' in blob
      ? Reflect.get(blob, 'messageType')
      : undefined;
  if (typeof messageTypeUnknown === 'string') {
    console.info('[buyer] DNP messageType:', messageTypeUnknown);
    return;
  }
  console.info('[buyer] only textual acknowledgement:', agentMessage.parts);
}

main().catch((err: unknown) => {
  console.error('[buyer] failed', err);
  process.exitCode = 1;
});
