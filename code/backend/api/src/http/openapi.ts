import swagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: { title: 'Amadeus API', version: '0.1.0' },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      },
    },
    transform: jsonSchemaTransform,
  });
}
