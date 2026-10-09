import type { ChatTransport } from './types';
/** No invented backend endpoint: local messages are handled by the store. */
export function createChatApi(transport: ChatTransport) {
  return {
    send: (text: string, signal?: AbortSignal) => transport.send(text, signal),
  };
}
