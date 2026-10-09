export type MessageRole = 'user' | 'preview';
export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  at: string;
}
export interface ChatTransport {
  send(text: string, signal?: AbortSignal): Promise<string>;
}
