import { RateLimitedError } from '../../domain/errors/rate-limit.ts';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/index.ts';

export function registerRateLimit(
  app: FastifyInstance,
  config: Pick<Config, 'HTTP_REQUESTS_PER_MINUTE'>,
) {
  const windows = new Map<string, { start: number; count: number }>();

  app.addHook('onRequest', async (request, reply) => {
    const now = Date.now();

    for (const [ip, window] of windows) {
      if (now - window.start >= 60000) {
        windows.delete(ip);
      }
    }

    let window = windows.get(request.ip);

    if (!window) {
      if (windows.size >= 1000) {
        throw new RateLimitedError('Limite temporário de requisições.');
      }

      window = { start: now, count: 0 };
      windows.set(request.ip, window);
    }

    window.count++;

    if (window.count > config.HTTP_REQUESTS_PER_MINUTE) {
      reply.header(
        'retry-after',
        Math.max(1, Math.ceil((60000 - (now - window.start)) / 1000)),
      );

      throw new RateLimitedError('Limite temporário de requisições.');
    }
  });
}
