import Fastify, { LogController } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppOptions } from './options.ts';

export function createServer(options: AppOptions) {
  const logger = options.logLevel
    ? {
        level: options.logLevel,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        ...(options.logStream ? { stream: options.logStream } : {}),
      }
    : false;

  const app = Fastify({
    ...(options.tls ? { https: options.tls } : {}),
    logger,
    trustProxy: false,
    logController: new LogController({ disableRequestLogging: true }),
    requestTimeout: 15000,
    connectionTimeout: 15000,
    forceCloseConnections: true,
    bodyLimit: 64 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  return app;
}
