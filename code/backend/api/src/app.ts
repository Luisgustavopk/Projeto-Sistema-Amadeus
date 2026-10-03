import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import {
  HealthSchema,
  CapabilitiesSchema,
  ErrorSchema,
} from './http/schemas.ts';

export async function buildApp(options: { token: string; logLevel?: string }) {
  if (options.token.length < 32)
    throw new Error('Credencial de acesso inválida.');
  const app = Fastify({
    logger: options.logLevel
      ? {
          level: options.logLevel,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        }
      : false,
    bodyLimit: 64 * 1024,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(swagger, {
    openapi: {
      info: { title: 'Amadeus API', version: '0.1.0' },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  app.get(
    '/v1/health',
    { schema: { response: { 200: HealthSchema } } },
    async () => ({ status: 'ok' as const, service: 'amadeus-api' as const }),
  );
  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', async (request, reply) => {
      const actual = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${options.token}`);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        return reply.code(401).send({ error: 'Acesso não autorizado.' });
      }
    });
    protectedApp.get(
      '/v1/capabilities',
      {
        schema: {
          security: [{ bearerAuth: [] }],
          response: { 200: CapabilitiesSchema, 401: ErrorSchema },
        },
      },
      async () => ({
        voice: false,
        customVoice: false,
        vision: false,
        memory: false,
        live2d: false,
        desktop: false,
      }),
    );
    protectedApp.get('/v1/openapi.json', { schema: { hide: true } }, async () =>
      app.swagger(),
    );
  });
  return app;
}
