import type { CallGate } from '../../ports/activity-gate.ts';
import type { TicketService } from './tickets.ts';
import { assertCallOrigin } from './origin-policy.ts';

export function createCallAuthorization(
  tickets: Pick<TicketService, 'consume'>,
  gate: CallGate,
  allowedOrigins: readonly string[],
) {
  return {
    async authorize(input: {
      conversationId: string;
      ticket: string;
      origin?: string | undefined;
    }) {
      assertCallOrigin(input.origin, allowedOrigins);

      // Reserve synchronously before consuming the ticket or awaiting persistence.
      const release = gate.acquireCall();

      try {
        await tickets.consume({ ...input, origin: input.origin });

        return release;
      } catch (error) {
        release();

        throw error;
      }
    },
  };
}

export type CallAuthorization = ReturnType<typeof createCallAuthorization>;
