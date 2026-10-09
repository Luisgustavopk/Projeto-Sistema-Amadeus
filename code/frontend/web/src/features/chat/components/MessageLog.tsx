import type { AriaRole } from 'react';
import type { Message } from '../types';
import { useEffect, useRef } from 'react';
export function MessageCount({ messages }: { messages: Message[] }) {
  return (
    <span className="message-count mono">
      {messages.length} {messages.length === 1 ? 'MENSAGEM' : 'MENSAGENS'}
    </span>
  );
}
export function MessageLog({
  messages,
  id,
  label,
  role,
}: {
  messages: Message[];
  id: string;
  label: string;
  role?: AriaRole;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);
  return (
    <div
      ref={ref}
      id={id}
      className="message-log"
      role={role}
      aria-label={label}
    >
      {!messages.length ? (
        <p className="empty-log">A sessão começa aqui.</p>
      ) : (
        messages.map((message) => (
          <div key={message.id} className={'message-entry ' + message.role}>
            <small>
              {message.role === 'user' ? 'VOCÊ' : 'AMADEUS · PRÉVIA'}
            </small>
            <p>{message.text}</p>
          </div>
        ))
      )}
    </div>
  );
}
