import express, { type Express } from 'express';
import type { AgentCard } from '@a2a-js/sdk';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { DefaultRequestHandler, InMemoryTaskStore, type AgentExecutor } from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';

export type DnpAgentServerOptions = {
  /** Fully qualified public base (e.g. `http://localhost:4101`). */
  readonly publicBaseUrl: string;
  /** Transport card fields minus `additionalInterfaces` — they are injected for JSON-RPC. */
  readonly agentCard: Omit<AgentCard, 'additionalInterfaces'>;
  readonly executor: AgentExecutor;
};

/**
 * Builds an Express application with the well-known Agent Card and JSON-RPC endpoints.
 */
export function createDnpExpressApp(options: DnpAgentServerOptions): Express {
  const jsonRpcUrl = `${normalizeBaseUrl(options.publicBaseUrl)}/a2a/jsonrpc`;
  const agentCard: AgentCard = {
    ...options.agentCard,
    additionalInterfaces: [{ transport: 'JSONRPC', url: jsonRpcUrl }],
  };

  const taskStore = new InMemoryTaskStore();
  const handler = new DefaultRequestHandler(agentCard, taskStore, options.executor);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: handler }));
  app.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({
      requestHandler: handler,
      userBuilder: UserBuilder.noAuthentication,
    }),
  );

  return app;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
