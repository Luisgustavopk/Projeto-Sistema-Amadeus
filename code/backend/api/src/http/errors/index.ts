import type { FastifyInstance } from 'fastify';
import { handleHttpError } from './handler.ts';
import { handleNotFound } from './not-found.ts';

export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler(handleHttpError);
  app.setNotFoundHandler(handleNotFound);
}
