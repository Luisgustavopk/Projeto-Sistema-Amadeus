import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { HttpServices } from '../dependencies.ts';
import {
  PersonaEditSchema,
  PersonaConfigurationSchema,
} from '../../application/persona/configuration.ts';
import { VoiceVersionSchema } from '../../application/voice/versions.ts';
import { security, errors } from './schemas/common.ts';

export function registerPersonaRoutes(
  instance: FastifyInstance,
  services: HttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/v1/persona',
    {
      schema: {
        security,
        response: { 200: PersonaConfigurationSchema, ...errors },
      },
    },
    () => services.persona.get(),
  );
  app.put(
    '/v1/persona',
    {
      schema: {
        security,
        body: PersonaEditSchema,
        response: { 200: PersonaConfigurationSchema, ...errors },
      },
    },
    (req) => services.persona.update(req.body),
  );
  app.get(
    '/v1/voice/versions',
    {
      schema: {
        security,
        response: {
          200: z.object({ versions: z.array(VoiceVersionSchema) }),
          ...errors,
        },
      },
    },
    async () => ({ versions: await services.voiceVersions.list() }),
  );
  app.post(
    '/v1/voice/versions',
    {
      schema: {
        security,
        body: z.strictObject({ name: z.string().trim().min(1).max(80) }),
        response: { 200: VoiceVersionSchema, ...errors },
      },
    },
    (req) => services.voiceVersions.capture(req.body.name),
  );
  app.post(
    '/v1/voice/versions/:id/restore',
    {
      schema: {
        security,
        params: z.object({ id: z.uuid() }),
        response: { 200: VoiceVersionSchema, ...errors },
      },
    },
    (req) => services.voiceVersions.restore(req.params.id),
  );
}
