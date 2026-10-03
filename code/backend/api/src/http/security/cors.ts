import { OriginDeniedError } from '../../domain/errors/access.ts';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/index.ts';

export function registerOriginChecks(
  app: FastifyInstance,
  config: Pick<Config, 'ALLOWED_ORIGINS'>,
) {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;

    if (origin && !config.ALLOWED_ORIGINS.includes(origin)) {
      throw new OriginDeniedError('Origem do cliente não autorizada.');
    }

    if (origin) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
    }
  });
}

export function registerPreflight(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;

    if (request.method === 'OPTIONS') {
      if (!origin) {
        throw new OriginDeniedError('Informe uma origem autorizada.');
      }

      reply.header('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
      reply.header(
        'access-control-allow-headers',
        'Authorization, Content-Type',
      );

      return reply.code(204).send();
    }
  });
}
