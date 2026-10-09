import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { useRef, useState } from 'react';
export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    input.current?.focus();
  }
  return (
    <form id="chat-form" className="chat-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="message">
        Mensagem
      </label>
      <input
        ref={input}
        id="message"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Escreva uma mensagem…"
        maxLength={2000}
        autoComplete="off"
        data-initial-focus
        required
      />
      <Button
        id="send-message"
        className="icon-button"
        aria-label="Enviar mensagem"
        disabled={!draft.trim()}
      >
        <svg className="icon">
          <use href="#icon-arrow" />
        </svg>
      </Button>
    </form>
  );
}
