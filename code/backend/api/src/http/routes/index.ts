import type { FastifyInstance } from 'fastify';
import type { HttpServices } from '../dependencies.ts';
import { registerSystemRoutes } from './system.ts';
import { registerProvidersRoutes } from './providers.ts';
import { registerConversationsRoutes } from './conversations.ts';

export function registerHttpRoutes(
  app: FastifyInstance,
  context: HttpServices,
) {
  registerSystemRoutes(app, context);
  registerProvidersRoutes(app, context);
  registerConversationsRoutes(app, context);
}
