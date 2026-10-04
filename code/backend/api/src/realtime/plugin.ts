import { SESSION_LIMITS } from './protocol/limits.ts';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';

export async function registerWebSocket(app: FastifyInstance) {
  await app.register(websocket, {
    options: {
      maxPayload: SESSION_LIMITS.maximumJsonBytes,
      perMessageDeflate: false,
    },

    errorHandler(error, socket) {
      const payloadExceeded =
        'code' in error && error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';

      app.log.warn({ code: 'WEBSOCKET_ERROR' }, 'websocket.failed');
      socket.close(payloadExceeded ? 1009 : 1011, 'WebSocket failure');

      const timeout = setTimeout(() => socket.terminate(), 2000);
      timeout.unref();

      socket.once('close', () => clearTimeout(timeout));
    },

    preClose: async () => {
      const sockets = [...app.websocketServer.clients];

      for (const socket of sockets) {
        socket.close(1012, 'Service restart');
      }

      const timeout = setTimeout(() => {
        for (const socket of sockets) {
          socket.terminate();
        }
      }, 2000);
      timeout.unref();
      await new Promise<void>((resolve) =>
        app.websocketServer.close(() => resolve()),
      );
      clearTimeout(timeout);
    },
  });
}
