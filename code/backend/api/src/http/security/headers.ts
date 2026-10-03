import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/index.ts';

export function registerSecurityHeaders(
  app: FastifyInstance,
  config: Pick<Config, 'TLS_CERT_FILE'>,
) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');

    if (config.TLS_CERT_FILE) {
      reply.header('strict-transport-security', 'max-age=31536000');
    }
  });
}
