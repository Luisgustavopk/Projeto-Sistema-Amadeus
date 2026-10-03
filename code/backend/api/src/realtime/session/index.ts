import type { WebSocket } from 'ws';
import { decodeClientMessage } from './decoder.ts';
import {
  createSessionState,
  rejectSession,
  type SessionAction,
} from './state.ts';
import { createSessionLifecycle } from './lifecycle.ts';
import { createSessionTransport } from './transport.ts';

export function attachCallSession(socket: WebSocket) {
  const transport = createSessionTransport(socket);
  const lifecycle = createSessionLifecycle(transport.close);
  const state = createSessionState();

  const apply = (action: SessionAction) => {
    if (action.negotiated) {
      lifecycle.negotiated();
    }

    transport.send(action.event);

    if (action.close) {
      transport.close(action.close.code, action.close.reason);
    }
  };

  socket.once('close', lifecycle.dispose);

  socket.on('message', (data, isBinary) => {
    if (!lifecycle.allowEvent()) {
      return apply(rejectSession('RATE_LIMITED'));
    }

    const decoded = decodeClientMessage(
      isBinary ? '' : data.toString(),
      isBinary,
    );

    if (!decoded.ok) {
      return apply(rejectSession(decoded.code));
    }

    apply(state.accept(decoded.event));
  });
}
