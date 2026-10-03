import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { HttpServices } from '../dependencies.ts';
import { createSystemController } from '../controllers/system.ts';
import * as schemas from './schemas/system.ts';

export function registerSystemRoutes(
  instance: FastifyInstance,
  context: HttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const controller = createSystemController(app, context);

  app.get('/v1/health', schemas.health, controller.health);

  app.options('/*', controller.preflight);

  app.get(
    '/v1/health/details',
    schemas.healthDetails,
    controller.healthDetails,
  );

  app.get('/v1/metrics', schemas.metrics, controller.metrics);

  app.get(
    '/v1/voice/protocol',
    schemas.voiceProtocol,
    controller.voiceProtocol,
  );

  app.get('/v1/capabilities', schemas.capabilities, controller.capabilities);

  app.get('/v1/openapi.json', schemas.openapi, controller.openapi);
}
