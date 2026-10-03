import type { VoiceSessions } from '../../application/voice/sessions.ts';
import { createVoiceSession } from './voice-session.ts';
import type { WebSocket } from 'ws';
import { decodeClientMessage } from './decoder.ts';
import {
  createSessionState,
  rejectSession,
  type SessionAction,
} from './state.ts';
import { createSessionLifecycle } from './lifecycle.ts';
import { createSessionTransport } from './transport.ts';

export function attachCallSession(
  socket: WebSocket,
  sessions?: VoiceSessions,
  conversationId?: string,
) {
  const transport = createSessionTransport(socket);
  const lifecycle = createSessionLifecycle(transport.close);
  const state = createSessionState();
  let voice: ReturnType<typeof createVoiceSession> | undefined;
  let negotiatingVoice = false;
  let foundationReady = false;

  const apply = (action: SessionAction) => {
    if (action.negotiated) {
      lifecycle.negotiated();
      foundationReady = true;
    }

    transport.send(action.event);

    if (action.close) {
      transport.close(action.close.code, action.close.reason);
    }
  };

  socket.once('close', lifecycle.dispose);

  socket.on('message', (data, isBinary) => {
    if (voice && isBinary) {
      voice.accept(data, true);

      return;
    }

    if (!voice && !lifecycle.allowEvent()) {
      return apply(rejectSession('RATE_LIMITED'));
    }

    const decoded = decodeClientMessage(
      isBinary ? '' : data.toString(),
      isBinary,
    );

    if (!decoded.ok) {
      return apply(rejectSession(decoded.code));
    }

    if (voice) {
      voice.accept(data, false, decoded.event);

      return;
    }

    if (
      decoded.event.type === 'session.start' &&
      decoded.event.protocolVersion === '1.1' &&
      sessions &&
      conversationId &&
      !negotiatingVoice &&
      !foundationReady
    ) {
      negotiatingVoice = true;
      lifecycle.dispose();
      voice = createVoiceSession(socket, sessions, conversationId);
      voice.start(decoded.event);

      return;
    }

    apply(state.accept(decoded.event));
  });
}
