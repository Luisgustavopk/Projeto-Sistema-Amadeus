import { randomUUID } from 'node:crypto';
import type { ClientMessage } from '../protocol/client-events.ts';
import type { ServerMessage } from '../protocol/server-events.ts';

export type SessionAction = {
  event: ServerMessage;
  negotiated?: boolean;
  close?: { code: number; reason: string };
};

export function rejectSession(code: string): SessionAction {
  return {
    event: { type: 'error', code },
    close: { code: 1008, reason: code },
  };
}

export function createSessionState() {
  let ready = false;

  return {
    accept(event: ClientMessage): SessionAction {
      if (!ready && event.type !== 'session.start') {
        return rejectSession('NEGOTIATION_REQUIRED');
      }

      switch (event.type) {
        case 'session.start': {
          if (event.protocolVersion !== '1.0') {
            return rejectSession('VOICE_PROTOCOL_REQUIRED');
          }

          if (ready) {
            return rejectSession('ALREADY_NEGOTIATED');
          }

          ready = true;

          return {
            negotiated: true,
            event: {
              type: 'session.ready',
              sessionId: randomUUID(),
              protocolVersion: '1.0',
              stage: 'foundation',
              voiceAvailable: false,
              audio: event.audio,
            },
          };
        }

        default:
          return rejectSession('VOICE_PROTOCOL_REQUIRED');
        case 'ping':
          return { event: { type: 'pong', id: event.id } };
        case 'session.end':
          return {
            event: { type: 'session.closed' },
            close: { code: 1000, reason: 'Session ended' },
          };
      }
    },
  };
}
