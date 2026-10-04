import type { VoiceSessions } from '../../application/voice/sessions.ts';
import type { WebSocket } from 'ws';
import { UpgradeRequiredError } from '../../domain/errors/calls.ts';
import type { FastifyRequest } from 'fastify';
import type { CallAuthorization } from '../../application/calls/authorization.ts';
import { attachCallSession } from '../session/index.ts';

type CallRequest = FastifyRequest<{
  Params: { id: string };
  Querystring: { ticket: string };
}>;

export function createCallController(
  calls: CallAuthorization,
  sessions?: VoiceSessions,
) {
  return {
    authorize: async (request: CallRequest) => {
      if (request.headers.upgrade?.toLowerCase() !== 'websocket') {
        throw new UpgradeRequiredError();
      }

      const release = await calls.authorize({
        conversationId: request.params.id,
        ticket: request.query.ticket,
        origin: request.headers.origin,
      });
      request.raw.socket.once('close', release);
      request.raw.once('aborted', release);

      if (request.raw.socket.destroyed || request.raw.aborted) {
        release();
      }
    },
    connect: (socket: WebSocket, request: CallRequest) => {
      socket.once('close', (closeCode) => {
        request.log.info({ closeCode }, 'websocket.closed');
      });
      attachCallSession(socket, sessions, request.params.id);
    },
  };
}
