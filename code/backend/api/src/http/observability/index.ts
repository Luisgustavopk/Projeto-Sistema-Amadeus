import type { FastifyInstance } from 'fastify';
import { registerHttpMetrics, type HttpMetrics } from './metrics.ts';
import { registerAccessLog } from './access-log.ts';

export function registerObservability(
  app: FastifyInstance,
  metrics: HttpMetrics,
) {
  registerHttpMetrics(app, metrics);
  registerAccessLog(app);
}
