import { NotFoundError } from '../../domain/errors/resources.ts';
import type { FastifyInstance } from 'fastify';

export function registerWebSocketUpgradeGuard(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    if (
      request.headers.upgrade?.toLowerCase() === 'websocket' &&
      request.routeOptions.url !== '/v1/conversations/:id/call'
    ) {
      throw new NotFoundError('Canal WebSocket não encontrado.');
    }
  });
}
