import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ConversationHttpServices } from '../dependencies.ts';
import { OriginDeniedError } from '../../domain/errors/access.ts';

export function createConversationsController({
  conversations,
  tickets,
}: ConversationHttpServices) {
  return {
    createConversation: async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.code(201).send(await conversations.create()),
    issueTicket: async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { origin: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (
        request.headers.origin &&
        request.headers.origin !== request.body.origin
      ) {
        throw new OriginDeniedError(
          'A origem do ticket deve corresponder ao cliente.',
        );
      }

      const ticket = await tickets.issue({
        conversationId: request.params.id,
        origin: request.body.origin,
      });

      return reply.code(201).send({ ...ticket, protocolVersion: '1.0' });
    },
  };
}
