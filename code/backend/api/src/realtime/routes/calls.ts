import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { VoiceSessions } from '../../application/voice/sessions.ts';
import type { CallAuthorization } from '../../application/calls/authorization.ts';
import { createCallController } from '../controllers/calls.ts';
import { CallRouteSchema } from './schemas/calls.ts';

export function registerRealtimeRoutes(
  instance: FastifyInstance,
  calls: CallAuthorization,
  sessions?: VoiceSessions,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const controller = createCallController(calls, sessions);

  app.get(
    '/v1/conversations/:id/call',
    {
      websocket: true,
      schema: CallRouteSchema,
      preHandler: controller.authorize,
    },
    controller.connect,
  );
}
