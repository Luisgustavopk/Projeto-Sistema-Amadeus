import type { FastifyInstance } from 'fastify';
import type { HttpServices } from '../dependencies.ts';
import { registerVoiceProfileRoutes } from './voice-profile.ts';
import { registerSystemRoutes } from './system.ts';
import { registerProvidersRoutes } from './providers.ts';
import { registerConversationsRoutes } from './conversations.ts';
import { registerPersonaRoutes } from './persona.ts';
import { registerMemoryRoutes } from './memory.ts';

export function registerHttpRoutes(
  app: FastifyInstance,
  context: HttpServices,
) {
  registerSystemRoutes(app, context);
  registerVoiceProfileRoutes(app, context);
  registerProvidersRoutes(app, context);
  registerConversationsRoutes(app, context);
  registerPersonaRoutes(app, context);
  registerMemoryRoutes(app, context);
}
