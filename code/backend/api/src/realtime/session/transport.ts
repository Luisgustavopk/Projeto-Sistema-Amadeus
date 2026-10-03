import { WebSocket } from 'ws';
import { ServerEvent, type ServerMessage } from '../protocol/server-events.ts';

export function createSessionTransport(socket: WebSocket) {
  return {
    send(event: ServerMessage) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(ServerEvent.parse(event)));
      }
    },
    close(code: number, reason: string) {
      socket.close(code, reason);
    },
  };
}
