import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { describeHttpError } from './response.ts';

export function handleHttpError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const details = describeHttpError(error);

  if (details.status === 401) {
    reply.header('www-authenticate', 'Bearer realm="amadeus"');
  }

  return reply.code(details.status).send({
    error: details.message,
    code: details.code,
    requestId: request.id,
  });
}
