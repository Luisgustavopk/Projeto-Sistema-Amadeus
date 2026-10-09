import { createContext, useContext, type PropsWithChildren } from 'react';
import type { Message, MessageRole } from './types';
import type { Notify } from '../../types/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
export function useCreateChatStore(notify: Notify) {
  const [messages, setMessages] = useState<Message[]>([]);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const append = useCallback((role: MessageRole, text: string) => {
    const entry: Message = {
      id: crypto.randomUUID(),
      role,
      text,
      at: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, entry].slice(-200));
  }, []);
  const appendUser = (text: string) => append('user', text);
  const clear = () => {
    setMessages([]);
    notify('Registro desta sessão limpo.');
  };
  function exportHistory() {
    const text = messages
      .map(
        (entry) =>
          (entry.role === 'user' ? 'Você: ' : 'Amadeus [prévia]: ') +
          entry.text,
      )
      .join('\n\n');
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'amadeus-sessao.txt';
    link.click();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      downloads.current.delete(url);
    }, 1000);
    downloads.current.set(url, timer);
  }
  useEffect(
    () => () => {
      for (const [url, timer] of downloads.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloads.current.clear();
    },
    [],
  );
  return { messages, append, appendUser, clear, exportHistory };
}

export type ChatStore = ReturnType<typeof useCreateChatStore>;
const Context = createContext<ChatStore | null>(null);
export function ChatProvider({
  children,
  notify,
}: PropsWithChildren<{ notify: Notify }>) {
  const value = useCreateChatStore(notify);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useChat() {
  const value = useContext(Context);
  if (!value) throw new Error('ChatProvider ausente.');
  return value;
}
