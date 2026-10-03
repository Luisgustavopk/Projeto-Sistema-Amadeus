import { UnauthorizedError } from '../../domain/errors/access.ts';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/index.ts';

export function registerAuthentication(
  app: FastifyInstance,
  config: Pick<Config, 'API_ACCESS_TOKEN'>,
) {
  app.addHook('onRequest', async (request) => {
    if (
      request.routeOptions.url === '/v1/health' ||
      request.routeOptions.url === '/v1/conversations/:id/call'
    ) {
      return;
    }

    const actual = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.API_ACCESS_TOKEN}`);

    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new UnauthorizedError('Acesso não autorizado.');
    }
  });
}
