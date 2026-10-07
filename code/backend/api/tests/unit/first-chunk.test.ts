import { expect, it, vi } from 'vitest';
import { withFirstChunkDeadline } from '../../src/application/providers/first-chunk.ts';

it('prazo inicial não corta uma resposta longa depois de começar', async () => {
  vi.useFakeTimers();

  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let received: AbortSignal | undefined;
  const stream = withFirstChunkDeadline(
    async function* (signal) {
      received = signal;
      yield {
        content: 'Primeiro texto.',
        inputTokens: null,
        outputTokens: null,
      };
      await pending;
      yield { content: 'Continuação.', inputTokens: null, outputTokens: null };
    },
    undefined,
    100,
  )[Symbol.asyncIterator]();

  try {
    expect((await stream.next()).value.content).toBe('Primeiro texto.');
    await vi.advanceTimersByTimeAsync(10000);
    expect(received?.aborted).toBe(false);
    finish();
    expect((await stream.next()).value.content).toBe('Continuação.');
    expect((await stream.next()).done).toBe(true);
  } finally {
    finish();
    await stream.return?.();
    vi.useRealTimers();
  }
});

it('cancela uma espera inicial mesmo se o adaptador ignorar o AbortSignal', async () => {
  const abort = new AbortController();
  const stream = withFirstChunkDeadline(
    async function* () {
      await new Promise(() => {});
      yield {
        content: 'Não deve chegar.',
        inputTokens: null,
        outputTokens: null,
      };
    },
    abort.signal,
    8000,
  )[Symbol.asyncIterator]();
  const pending = expect(stream.next()).rejects.toMatchObject({
    name: 'AbortError',
  });
  abort.abort();
  await pending;
});
