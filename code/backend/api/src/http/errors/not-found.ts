import type { FastifyRequest, FastifyReply } from 'fastify';

export function handleNotFound(request: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send({
    error: 'Rota não encontrada.',
    code: 'NOT_FOUND',
    requestId: request.id,
  });
}
