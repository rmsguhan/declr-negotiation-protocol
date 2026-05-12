import type { AgentCard } from '@a2a-js/sdk';
import { DnpNegotiationExecutor, startDnpNegotiationServer } from '@declr/dnp-agent';
import type { Logger } from '@declr/dnp-protocol';
import {
  DeliveryMethodNegotiationStrategy,
  DeliverySpeedNegotiationStrategy,
  NegotiationOrchestrator,
  PriceNegotiationStrategy,
  QuantityNegotiationStrategy,
} from '@declr/dnp-strategies';

const consoleLogger: Logger = {
  debug(m, meta): void {
    console.debug(`[seller] ${m}`, meta);
  },
  info(m, meta): void {
    console.info(`[seller] ${m}`, meta);
  },
  warn(m, meta): void {
    console.warn(`[seller] ${m}`, meta);
  },
  error(m, meta): void {
    console.error(`[seller] ${m}`, meta);
  },
};

const port = Number.parseInt(process.env['PORT'] ?? '4101', 10);
const host = process.env['HOST'] ?? '127.0.0.1';
const baseUrlRaw = process.env['PUBLIC_BASE_URL'] ?? `http://${host}:${String(port)}`;

async function launch(): Promise<void> {
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

  const trimmedBase = baseUrlRaw.endsWith('/') ? baseUrlRaw.slice(0, -1) : baseUrlRaw;

  const sellerCardBase: Omit<AgentCard, 'additionalInterfaces'> = {
    name: 'Declr Seller Agent (demo)',
    description:
      'Reference seller agent validating DNP payloads and applying deterministic negotiation strategies.',
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

  await startDnpNegotiationServer({
    publicBaseUrl: trimmedBase,
    host,
    port,
    executor: agentExecutor,
    agentCard: sellerCardBase,
  });

  consoleLogger.info(`DNP seller listening at ${trimmedBase} (Agent Card JSON-RPC)`, {});
}

launch().catch((err: unknown) => {
  console.error('[seller] failed to boot', err);
  process.exitCode = 1;
});
