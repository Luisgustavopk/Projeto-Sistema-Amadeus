import type { FastifyInstance } from 'fastify';

export function registerAccessLog(app: FastifyInstance) {
  app.addHook('onResponse', async (request, reply) => {
    app.log.info(
      {
        requestId: request.id,
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      'request.completed',
    );
  });
}
