import type { AgentCard } from '@a2a-js/sdk';
import type { Message, MessageSendParams, Task } from '@a2a-js/sdk';
import { ClientFactory } from '@a2a-js/sdk/client';
import { createDnpExpressApp, DnpNegotiationExecutor } from '@declr/dnp-agent';
import type { DnpPayload, Logger } from '@declr/dnp-protocol';
import { parseDnpPayload } from '@declr/dnp-protocol';
import {
  DeliveryMethodNegotiationStrategy,
  DeliverySpeedNegotiationStrategy,
  NegotiationOrchestrator,
  PriceNegotiationStrategy,
  QuantityNegotiationStrategy,
} from '@declr/dnp-strategies';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const consoleLogger: Logger = {
  debug(m, meta): void {
    console.debug(`[negotiation-ui] ${m}`, meta);
  },
  info(m, meta): void {
    console.info(`[negotiation-ui] ${m}`, meta);
  },
  warn(m, meta): void {
    console.warn(`[negotiation-ui] ${m}`, meta);
  },
  error(m, meta): void {
    console.error(`[negotiation-ui] ${m}`, meta);
  },
};

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

function summarizeDnp(dnp: DnpPayload): string {
  const p = dnp.negotiationState.parameters;
  const r = dnp.negotiationState.roundNumber;
  return `round ${String(r)} · ${dnp.messageType} · $${String(p.price.value)} ${p.price.currency} · qty ${String(p.quantity)} · ${p.deliveryMethod} · ${String(p.deliverySpeedDays.min)}–${String(p.deliverySpeedDays.max)}d`;
}

async function main(): Promise<void> {
  const port = Number.parseInt(process.env['PORT'] ?? '4173', 10);
  const host = process.env['HOST'] ?? '127.0.0.1';
  const trimmedBase = (process.env['PUBLIC_BASE_URL'] ?? `http://${host}:${String(port)}`).replace(
    /\/$/,
    '',
  );

  const strategies = [
    new PriceNegotiationStrategy({ min: 110, max: 260 }),
    new DeliverySpeedNegotiationStrategy({ minDays: 1, maxDays: 14 }),
    new DeliveryMethodNegotiationStrategy(new Set(['postal', 'courier', 'hand_deliver'])),
    new QuantityNegotiationStrategy(1, 25),
  ];
  const orchestrator = new NegotiationOrchestrator(strategies, consoleLogger);
  const agentExecutor = new DnpNegotiationExecutor({
    logger: consoleLogger,
    orchestrator,
  });

  const sellerCardBase: Omit<AgentCard, 'additionalInterfaces'> = {
    name: 'Declr Seller Agent (demo + UI)',
    description: 'Same negotiation stack as seller-agent, co-hosted with a small visualization UI.',
    protocolVersion: '0.3.0',
    version: '0.1.0',
    url: `${trimmedBase}/`,
    skills: [
      {
        id: 'dnp-negotiate',
        name: 'DNP Negotiation',
        description:
          'Negotiates price, delivery windows, fulfillment method, and quantity per Declr Negotiation Protocol.',
        tags: ['commerce', 'negotiation', 'dnp'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    preferredTransport: 'JSONRPC',
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/send', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as { readonly dnp?: unknown; readonly contextId?: string };
      const parsed = parseDnpPayload(body.dnp);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, error: parsed.error });
        return;
      }
      const dnp = parsed.value;
      const contextId =
        typeof body.contextId === 'string' && body.contextId.length > 0
          ? body.contextId
          : randomUUID();

      const factory = new ClientFactory();
      const client = await factory.createFromUrl(trimmedBase);

      const sendParams: MessageSendParams = {
        message: {
          kind: 'message',
          messageId: randomUUID(),
          role: 'user',
          contextId,
          parts: [
            { kind: 'text', text: 'DNP negotiation payload (from negotiation-ui)' },
            { kind: 'data', data: dnp as unknown as Record<string, unknown> },
          ],
        },
      };

      const a2aResponse = await client.sendMessage(sendParams);
      const agentMessage = summarizeAssistantMessage(a2aResponse);

      if (!agentMessage) {
        res.json({
          ok: true,
          contextId,
          agentSummary: `non-message response: ${a2aResponse.kind}`,
          dnp: undefined as DnpPayload | undefined,
          textParts: [],
        });
        return;
      }

      const textParts = agentMessage.parts
        .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
        .map((p) => p.text);

      const blob = findDnpData(agentMessage);
      const dnpParsed = blob !== undefined ? parseDnpPayload(blob) : undefined;
      const replyDnp = dnpParsed?.ok === true ? dnpParsed.value : undefined;

      res.json({
        ok: true,
        contextId,
        agentSummary:
          replyDnp !== undefined ? summarizeDnp(replyDnp) : textParts.join(' · ') || '(no text)',
        dnp: replyDnp,
        textParts,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      consoleLogger.error('POST /api/send failed', { msg });
      res.status(500).json({ ok: false, error: msg });
    }
  });

  const dnpApp = createDnpExpressApp({
    publicBaseUrl: trimmedBase,
    agentCard: sellerCardBase,
    executor: agentExecutor,
  });
  app.use(dnpApp);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  app.use(express.static(join(__dirname, '../public')));

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      resolve();
    });
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        console.error(
          `[negotiation-ui] Port ${String(port)} on ${host} is already in use (EADDRINUSE).`,
        );
        console.error(
          `Free it, e.g.:  kill "$(lsof -t -iTCP:${String(port)} -sTCP:LISTEN)"  or use  PORT=4174 npm run dev`,
        );
      }
      reject(e);
    });
  });

  consoleLogger.info(`Open http://${host}:${String(port)}/ for the negotiation timeline UI`, {});
  consoleLogger.info(`A2A JSON-RPC: ${trimmedBase}/a2a/jsonrpc`, {});
}

main().catch((err: unknown) => {
  console.error('[negotiation-ui] failed to boot', err);
  process.exitCode = 1;
});
