import type { FastifyInstance } from 'fastify';

export type HttpMetrics = {
  requests: number;
  errors: number;
  totalDurationMs: number;
};

export function registerHttpMetrics(
  app: FastifyInstance,
  metrics: HttpMetrics,
) {
  app.addHook('onResponse', async (_request, reply) => {
    metrics.requests++;
    metrics.totalDurationMs += reply.elapsedTime;

    if (reply.statusCode >= 400) {
      metrics.errors++;
    }
  });
}
