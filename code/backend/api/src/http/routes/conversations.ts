import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { HttpServices } from '../dependencies.ts';
import { createConversationsController } from '../controllers/conversations.ts';
import * as schemas from './schemas/conversations.ts';

export function registerConversationsRoutes(
  instance: FastifyInstance,
  context: HttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const controller = createConversationsController(context);

  app.post(
    '/v1/conversations',
    schemas.createConversation,
    controller.createConversation,
  );

  app.post(
    '/v1/conversations/:id/call-tickets',
    schemas.issueTicket,
    controller.issueTicket,
  );
}
