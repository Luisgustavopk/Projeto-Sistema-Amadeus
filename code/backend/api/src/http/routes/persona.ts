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
import {
  VoiceRuntimeStateSchema,
  VoiceRuntimeEditSchema,
} from '../../application/voice/runtime-configuration.ts';
import { ProvidersSchema } from '../../domain/providers/model.ts';
import { PersonaStateSchema } from '../../application/persona/persistent-state.ts';
import {
  PersonaAnalysisEditSchema,
  PersonaAnalysisStateSchema,
} from '../../application/persona/analysis.ts';

export function registerPersonaRoutes(
  instance: FastifyInstance,
  services: HttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/v1/voice/runtime',
    {
      schema: {
        security,
        response: { 200: VoiceRuntimeStateSchema, ...errors },
      },
    },
    () => services.voiceRuntime.get(),
  );
  app.put(
    '/v1/voice/runtime',
    {
      schema: {
        security,
        body: VoiceRuntimeEditSchema,
        response: { 200: VoiceRuntimeStateSchema, ...errors },
      },
    },
    (req) => services.voiceRuntime.configure(req.body),
  );
  app.post(
    '/v1/voice/runtime/author',
    {
      schema: {
        security,
        body: z.strictObject({ author: z.enum(['llama', 'deepseek']) }),
        response: { 200: ProvidersSchema, ...errors },
      },
    },
    (req) => services.voiceRuntime.selectAuthor(req.body.author),
  );
  const stateQuery = z.object({
    dataClass: z
      .enum(['personal', 'synthetic', 'local-only'])
      .default('personal'),
  });
  app.get(
    '/v1/persona/state',
    {
      schema: {
        security,
        querystring: stateQuery,
        response: {
          200: PersonaStateSchema.omit({ lastResponseIds: true }).extend({
            familiarity: z.enum(['F0', 'F1', 'F2']),
          }),
          ...errors,
        },
      },
    },
    (req) => services.persistentState.snapshot(req.query.dataClass),
  );
  app.delete(
    '/v1/persona/state',
    {
      schema: {
        security,
        querystring: stateQuery,
        response: { 200: z.object({ reset: z.literal(true) }), ...errors },
      },
    },
    async (req) => {
      await services.persistentState.reset(req.query.dataClass);

      return { reset: true as const };
    },
  );
  app.get(
    '/v1/persona/analysis',
    {
      schema: {
        security,
        response: {
          200: PersonaAnalysisStateSchema.extend({
            model: z.string(),
            apiKeyEnv: z.string(),
            usage: z.unknown(),
            counts: z.unknown(),
          }),
          ...errors,
        },
      },
    },
    () => services.personaAnalysis.describe(),
  );
  app.put(
    '/v1/persona/analysis',
    {
      schema: {
        security,
        body: PersonaAnalysisEditSchema,
        response: { 200: PersonaAnalysisStateSchema, ...errors },
      },
    },
    (req) => services.personaAnalysis.configure(req.body),
  );
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
