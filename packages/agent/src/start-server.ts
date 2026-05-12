import type { AgentCard } from '@a2a-js/sdk';
import type { ListenOptions } from 'node:net';
import type { Server } from 'node:http';
import { createDnpExpressApp, type DnpAgentServerOptions } from './dnp-server.js';
import { normalizeBaseUrl } from './utils.js';

export type StartDnpServerInput = Omit<DnpAgentServerOptions, 'agentCard'> & {
  readonly host?: string | undefined;
  readonly port?: number | undefined;
  readonly listenOptions?: ListenOptions | undefined;
  readonly agentCard: Omit<AgentCard, 'additionalInterfaces'> | AgentCard;
};

/**
 * Spins up an HTTP listener with JSON-RPC wired for DNP payloads.
 *
 * @note Callers configure logging (including `express` diagnostics) separately.
 */
export async function startDnpNegotiationServer(
  serverOptions: StartDnpServerInput,
): Promise<{ readonly close: () => Promise<void>; readonly baseUrl: string }> {
  const { host = '127.0.0.1', port = 4101, listenOptions, ...rest } = serverOptions;
  const baseUrl = normalizeBaseUrl(rest.publicBaseUrl);

  const app = createDnpExpressApp({
    publicBaseUrl: baseUrl,
    agentCard: stripAdditionalInterfaces(rest.agentCard),
    executor: rest.executor,
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen({ host, port, ...listenOptions }, () => {
      resolve(listener);
    });
    listener.on('error', reject);
  });

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

function stripAdditionalInterfaces(
  card: StartDnpServerInput['agentCard'],
): Omit<AgentCard, 'additionalInterfaces'> {
  const { additionalInterfaces: _drop, ...rest } = card as AgentCard;
  void _drop;
  return rest;
}
