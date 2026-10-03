import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { HttpServices } from '../dependencies.ts';
import { createProvidersController } from '../controllers/providers.ts';
import * as schemas from './schemas/providers.ts';

export function registerProvidersRoutes(
  instance: FastifyInstance,
  context: HttpServices,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const controller = createProvidersController(context);

  app.get('/v1/usage', schemas.usage, controller.usage);

  app.get('/v1/providers', schemas.getProviders, controller.getProviders);

  app.put(
    '/v1/providers',
    schemas.configureProviders,
    controller.configureProviders,
  );

  app.get(
    '/v1/providers/protocol',
    schemas.providerProtocol,
    controller.providerProtocol,
  );
}
