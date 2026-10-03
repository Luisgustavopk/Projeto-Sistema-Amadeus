import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { VoiceHttpServices } from '../dependencies.ts';
import { createVoiceProfileController } from '../controllers/voice-profile.ts';
import * as schemas from './schemas/voice-profile.ts';

export function registerVoiceProfileRoutes(
  instance: FastifyInstance,
  services: VoiceHttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const controller = createVoiceProfileController(services);
  app.get('/v1/voice/profile', schemas.get, controller.get);
  app.put('/v1/voice/profile', schemas.activate, controller.activate);
}
