import { randomBytes } from 'node:crypto';
import type { ConversationRepository } from '../../ports/conversation-repository.ts';
import type { CallTicketRepository } from '../../ports/call-ticket-repository.ts';
import { NotFoundError } from '../../domain/errors/resources.ts';
import { UnauthorizedError } from '../../domain/errors/access.ts';
import { assertCallOrigin } from './origin-policy.ts';

export type TicketPolicy = {
  ownerId: string;
  credential: string;
  allowedOrigins: readonly string[];
  ttlSeconds: number;
};

export function createTicketService(
  conversations: ConversationRepository,
  tickets: CallTicketRepository,
  policy: TicketPolicy,
) {
  return {
    async issue(input: { conversationId: string; origin: string }) {
      assertCallOrigin(input.origin, policy.allowedOrigins);

      if (
        !(await conversations.belongsTo(input.conversationId, policy.ownerId))
      ) {
        throw new NotFoundError('Conversa não encontrada.');
      }

      const ticket = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + policy.ttlSeconds * 1000;
      await tickets.create({
        ticket,
        conversation: input.conversationId,
        owner: policy.ownerId,
        credential: policy.credential,
        origin: input.origin,
        expiresAt,
      });

      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },
    async consume(input: {
      conversationId: string;
      ticket: string;
      origin: string;
    }) {
      const owned = await conversations.belongsTo(
        input.conversationId,
        policy.ownerId,
      );
      const consumed =
        owned &&
        (await tickets.consume({
          ticket: input.ticket,
          conversation: input.conversationId,
          owner: policy.ownerId,
          credential: policy.credential,
          origin: input.origin,
        }));

      if (!consumed) {
        throw new UnauthorizedError(
          'Ticket inválido, expirado ou já utilizado.',
        );
      }
    },
  };
}

export type TicketService = ReturnType<typeof createTicketService>;
