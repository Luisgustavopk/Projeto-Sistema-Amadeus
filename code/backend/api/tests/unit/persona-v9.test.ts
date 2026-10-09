import { describe, expect, it, vi } from 'vitest';
import { expressionObserverPrompt } from '../../src/application/persona/expression-observer-prompt.ts';
import { streamSpeech } from '../../src/application/voice/speech-stream.ts';
import {
  groupedActingMessages,
  rankInteractionFunctions,
} from '../../src/evaluation/persona/sequence-selection.ts';

describe('contextual reaction candidates', () => {
  it('keeps complete fictional scenes separate from actual conversation roles', () => {
    const history = [{ role: 'assistant', content: 'This is the real reply.' }];
    const messages = groupedActingMessages({
      system: 'Core',
      history,
      user: 'Continue.',
      examples: [
        {
          id: 'example',
          description: 'Repair',
          messages: [
            { role: 'user', content: 'An imagined drawing' },
            { role: 'assistant', content: '<expression>{}</expression>Sorry.' },
          ],
        },
      ],
    });
    expect(messages.filter((message) => message.role === 'assistant')).toEqual(
      history,
    );
    expect(messages[1]!.content).toContain('fictionalScene');
    expect(messages[1]!.content).not.toContain('<expression>');
    expect(history).toEqual([
      { role: 'assistant', content: 'This is the real reply.' },
    ]);
  });

  it('lets current multilingual semantic evidence outweigh prior subject', () => {
    expect(
      rankInteractionFunctions(
        [
          { id: 'repair', description: '' },
          { id: 'sadness', description: '' },
        ],
        [
          [1, 0],
          [0, 1],
        ],
        [1, 0],
        [0, 1],
      ).map((item) => item.id),
    ).toEqual(['repair', 'sadness']);
    expect(() => rankInteractionFunctions([], [], [])).toThrow();
    expect(() =>
      rankInteractionFunctions([{ id: 'x', description: '' }], [[1]], [1, 0]),
    ).toThrow();
  });

  it('describes persona reaction with continuous anchored intensity', () => {
    const prompt = expressionObserverPrompt();
    expect(prompt).toContain('segmento');
    expect(prompt).toContain('usuário pertence ao usuário');
    expect(prompt).toContain('Valores intermediários são válidos');
    expect(prompt).toContain('irritacao');
    expect(expressionObserverPrompt(false)).not.toContain(
      'Valores intermediários',
    );
  });
});

const segments = (...args: Parameters<typeof streamSpeech>) =>
  streamSpeech(...args)[Symbol.asyncIterator]();

describe('optional first-segment deadline', () => {
  it('keeps the existing 700ms default and rejects invalid deadlines', async () => {
    vi.useFakeTimers();

    try {
      async function* source() {
        yield 'Uma primeira frase completa e suficientemente comprida.';
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield ' Final.';
      }

      const stream = segments(source, new AbortController().signal);
      const first = stream.next();
      let resolved = false;
      void first.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(699);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await first).value).toContain('comprida.');
      const next = stream.next();
      await vi.advanceTimersByTimeAsync(300);
      await next;
      await stream.next();
      await expect(
        segments(source, new AbortController().signal, {
          firstFlushMs: -1,
        }).next(),
      ).rejects.toThrow(RangeError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases a complete first sentence earlier without releasing incomplete words', async () => {
    vi.useFakeTimers();

    try {
      async function* source() {
        yield 'Esta frase tem um ponto final completo. A próxima';
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield ' continua aqui.';
      }

      const stream = segments(source, new AbortController().signal, {
        firstFlushMs: 200,
      });
      const first = stream.next();
      await vi.advanceTimersByTimeAsync(199);
      let resolved = false;
      void first.then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await first).value).toBe(
        'Esta frase tem um ponto final completo.',
      );
      const second = stream.next();
      await vi.advanceTimersByTimeAsync(800);
      expect((await second).value).toBe('A próxima continua aqui.');
      expect((await stream.next()).done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves cancellation while waiting for source data', async () => {
    const controller = new AbortController();

    async function* source(signal: AbortSignal) {
      yield 'Uma resposta suficiente para liberar a primeira frase.';
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    }

    const stream = segments(source, controller.signal, { firstFlushMs: 0 });
    expect((await stream.next()).value).toContain('primeira frase.');
    controller.abort();
    await expect(stream.next()).rejects.toThrow();
  });
});
