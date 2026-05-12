import type { AgentCard } from '@a2a-js/sdk';
import {
  buildAutomatedSellerReply,
  createDnpExpressApp,
  DnpNegotiationExecutor,
} from '@declr/dnp-agent';
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

type ActorMode = 'human' | 'agentic';

type ThreadHistoryEntry = {
  readonly buyer: DnpPayload;
  seller?: DnpPayload;
  sellerText?: string;
};

type NegotiationThread = {
  readonly threadId: string;
  readonly contextId: string;
  readonly buyerAgentId: string;
  readonly sellerAgentId: string;
  readonly createdAtMs: number;
  buyerMode: ActorMode;
  sellerMode: ActorMode;
  modesLocked: boolean;
  history: ThreadHistoryEntry[];
  pendingHumanSellerInbound?: DnpPayload;
};

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

const threads = new Map<string, NegotiationThread>();

function threadIdParam(req: Request): string | undefined {
  const raw = req.params['threadId'];
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  if (Array.isArray(raw) && raw[0] !== undefined && raw[0].length > 0) {
    return raw[0];
  }
  return undefined;
}

function summarizeDnp(dnp: DnpPayload): string {
  const p = dnp.negotiationState.parameters;
  const r = dnp.negotiationState.roundNumber;
  return `round ${String(r)} · ${dnp.messageType} · $${String(p.price.value)} ${p.price.currency} · qty ${String(p.quantity)} · ${p.deliveryMethod} · ${String(p.deliverySpeedDays.min)}–${String(p.deliverySpeedDays.max)}d`;
}

function normalizeBuyerInbound(thread: NegotiationThread, dnp: DnpPayload): DnpPayload {
  return {
    ...dnp,
    senderAgentId: thread.buyerAgentId,
    recipientAgentId: thread.sellerAgentId,
    negotiationState: {
      ...dnp.negotiationState,
      proposedBy: thread.buyerAgentId,
    },
  };
}

function normalizeSellerOutbound(thread: NegotiationThread, dnp: DnpPayload): DnpPayload {
  return {
    ...dnp,
    senderAgentId: thread.sellerAgentId,
    recipientAgentId: thread.buyerAgentId,
    negotiationState: {
      ...dnp.negotiationState,
      proposedBy: thread.sellerAgentId,
    },
  };
}

function createThread(): NegotiationThread {
  const threadId = randomUUID();
  const buyerAgentId = `did:declr:buyer-${threadId.slice(0, 8)}`;
  const sellerAgentId = `did:declr:seller-${threadId.slice(0, 8)}`;
  const t: NegotiationThread = {
    threadId,
    contextId: threadId,
    buyerAgentId,
    sellerAgentId,
    createdAtMs: Date.now(),
    buyerMode: 'human',
    sellerMode: 'human',
    modesLocked: false,
    history: [],
  };
  threads.set(threadId, t);
  return t;
}

function threadSummary(t: NegotiationThread) {
  const last = t.history[t.history.length - 1];
  return {
    threadId: t.threadId,
    contextId: t.contextId,
    buyerAgentId: t.buyerAgentId,
    sellerAgentId: t.sellerAgentId,
    buyerMode: t.buyerMode,
    sellerMode: t.sellerMode,
    modesLocked: t.modesLocked,
    pendingHumanSeller: t.pendingHumanSellerInbound !== undefined,
    messageCount: t.history.length,
    lastBuyerSummary: last !== undefined ? summarizeDnp(last.buyer) : '',
    lastSellerSummary:
      last?.seller !== undefined ? summarizeDnp(last.seller) : (last?.sellerText ?? ''),
  };
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
    description: 'Same negotiation stack as seller-agent, co-hosted with a visualization UI.',
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

  app.get('/api/threads', (_req: Request, res: Response): void => {
    res.json({ ok: true, threads: [...threads.values()].map(threadSummary) });
  });

  app.get('/api/threads/:threadId', (req: Request, res: Response): void => {
    const id = threadIdParam(req);
    if (id === undefined) {
      res.status(400).json({ ok: false, error: 'missing_thread_id' });
      return;
    }
    const t = threads.get(id);
    if (t === undefined) {
      res.status(404).json({ ok: false, error: 'thread_not_found' });
      return;
    }
    res.json({
      ok: true,
      thread: threadSummary(t),
      history: t.history,
      pendingHumanSellerInbound: t.pendingHumanSellerInbound,
    });
  });

  app.post('/api/threads', (_req: Request, res: Response): void => {
    const t = createThread();
    consoleLogger.info('Created negotiation thread', { threadId: t.threadId });
    res.status(201).json({ ok: true, thread: threadSummary(t) });
  });

  app.post('/api/threads/:threadId/buyer-message', (req: Request, res: Response): void => {
    try {
      const threadId = threadIdParam(req);
      if (threadId === undefined) {
        res.status(400).json({ ok: false, error: 'missing_thread_id' });
        return;
      }
      const thread = threads.get(threadId);
      if (thread === undefined) {
        res.status(404).json({ ok: false, error: 'thread_not_found' });
        return;
      }

      const body = req.body as {
        readonly dnp?: unknown;
        readonly buyerMode?: ActorMode;
        readonly sellerMode?: ActorMode;
      };

      const parsed = parseDnpPayload(body.dnp);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, error: parsed.error });
        return;
      }

      if (!thread.modesLocked) {
        if (body.buyerMode === 'human' || body.buyerMode === 'agentic') {
          thread.buyerMode = body.buyerMode;
        }
        if (body.sellerMode === 'human' || body.sellerMode === 'agentic') {
          thread.sellerMode = body.sellerMode;
        }
        thread.modesLocked = true;
      }

      const inbound = normalizeBuyerInbound(thread, parsed.value);
      const entry: ThreadHistoryEntry = { buyer: inbound };
      thread.history.push(entry);

      if (thread.sellerMode === 'agentic') {
        const auto = buildAutomatedSellerReply(inbound, orchestrator);
        if (auto.kind === 'text_reject') {
          entry.sellerText = auto.text;
          thread.pendingHumanSellerInbound = undefined;
          res.json({
            ok: true,
            threadId: thread.threadId,
            contextId: thread.contextId,
            awaitingSellerHuman: false,
            agentSummary: auto.text,
            dnp: undefined as DnpPayload | undefined,
            textParts: [auto.text],
            buyerAgentId: thread.buyerAgentId,
            sellerAgentId: thread.sellerAgentId,
            buyerMode: thread.buyerMode,
            sellerMode: thread.sellerMode,
            modesLocked: thread.modesLocked,
          });
          return;
        }
        entry.seller = auto.dnp;
        thread.pendingHumanSellerInbound = undefined;
        res.json({
          ok: true,
          threadId: thread.threadId,
          contextId: thread.contextId,
          awaitingSellerHuman: false,
          agentSummary: summarizeDnp(auto.dnp),
          dnp: auto.dnp,
          textParts: [auto.rationale],
          buyerAgentId: thread.buyerAgentId,
          sellerAgentId: thread.sellerAgentId,
          buyerMode: thread.buyerMode,
          sellerMode: thread.sellerMode,
          modesLocked: thread.modesLocked,
        });
        return;
      }

      thread.pendingHumanSellerInbound = inbound;
      res.json({
        ok: true,
        threadId: thread.threadId,
        contextId: thread.contextId,
        awaitingSellerHuman: true,
        agentSummary: 'Seller is human — compose a reply in the seller pane.',
        dnp: undefined as DnpPayload | undefined,
        textParts: [],
        buyerAgentId: thread.buyerAgentId,
        sellerAgentId: thread.sellerAgentId,
        buyerMode: thread.buyerMode,
        sellerMode: thread.sellerMode,
        modesLocked: thread.modesLocked,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      consoleLogger.error('buyer-message failed', { msg });
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/threads/:threadId/seller-message', (req: Request, res: Response): void => {
    try {
      const threadId = threadIdParam(req);
      if (threadId === undefined) {
        res.status(400).json({ ok: false, error: 'missing_thread_id' });
        return;
      }
      const thread = threads.get(threadId);
      if (thread === undefined) {
        res.status(404).json({ ok: false, error: 'thread_not_found' });
        return;
      }
      if (thread.sellerMode !== 'human') {
        res.status(400).json({ ok: false, error: 'seller_not_human_mode' });
        return;
      }
      if (thread.pendingHumanSellerInbound === undefined) {
        res.status(400).json({ ok: false, error: 'no_pending_buyer_message' });
        return;
      }

      const body = req.body as { readonly dnp?: unknown };
      const parsed = parseDnpPayload(body.dnp);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, error: parsed.error });
        return;
      }

      const outbound = normalizeSellerOutbound(thread, parsed.value);
      const last = thread.history[thread.history.length - 1];
      if (last === undefined) {
        res.status(400).json({ ok: false, error: 'empty_history' });
        return;
      }
      last.seller = outbound;
      last.sellerText = undefined;
      thread.pendingHumanSellerInbound = undefined;

      res.json({
        ok: true,
        threadId: thread.threadId,
        contextId: thread.contextId,
        agentSummary: summarizeDnp(outbound),
        dnp: outbound,
        buyerAgentId: thread.buyerAgentId,
        sellerAgentId: thread.sellerAgentId,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      consoleLogger.error('seller-message failed', { msg });
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

  consoleLogger.info(`Open http://${host}:${String(port)}/ for the negotiation UI`, {});
  consoleLogger.info(`A2A JSON-RPC (external clients): ${trimmedBase}/a2a/jsonrpc`, {});
}

main().catch((err: unknown) => {
  console.error('[negotiation-ui] failed to boot', err);
  process.exitCode = 1;
});
