import { expect, it } from 'vitest';
import { streamSpeech } from '../../src/application/voice/speech-stream.ts';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';

it('entrega uma frase antes do fim da geração', async () => {
  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const source = async function* () {
    yield 'Olá. ';
    await pending;
    yield 'Estou aqui.';
  };

  const stream = streamSpeech(source, new AbortController().signal)[
    Symbol.asyncIterator
  ]();

  try {
    expect(await stream.next()).toEqual({ value: 'Olá.', done: false });
    finish();
    expect(await stream.next()).toEqual({ value: 'Estou aqui.', done: false });
    expect((await stream.next()).done).toBe(true);
  } finally {
    finish();
    await stream.return?.();
  }
});
it('entrega uma cláusula longa na vírgula antes do fim da frase', async () => {
  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const source = async function* () {
    yield 'Histórias requerem narração, ';
    await pending;
    yield 'o que já estamos fazendo aqui.';
  };

  const stream = streamSpeech(source, new AbortController().signal)[
    Symbol.asyncIterator
  ]();

  try {
    expect(await stream.next()).toEqual({
      value: 'Histórias requerem narração,',
      done: false,
    });
    finish();
    expect(await stream.next()).toEqual({
      value: 'o que já estamos fazendo aqui.',
      done: false,
    });
    expect((await stream.next()).done).toBe(true);
  } finally {
    finish();
    await stream.return?.();
  }
});
it('não divide uma introdução curta em um segmento sem contexto', async () => {
  const source = async function* () {
    yield 'Sim, ';
    yield 'essa frase continua até o ponto final.';
  };

  const segments = [];

  for await (const segment of streamSpeech(
    source,
    new AbortController().signal,
  )) {
    segments.push(segment);
  }

  expect(segments).toEqual(['Sim, essa frase continua até o ponto final.']);
});
it('cancela a leitura pendente quando o consumidor interrompe', async () => {
  let aborted = false;

  const source = async function* (signal: AbortSignal) {
    yield 'Olá. ';
    await new Promise<void>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          resolve();
        },
        { once: true },
      );
    });
    signal.throwIfAborted();
  };

  const stream = streamSpeech(source, new AbortController().signal)[
    Symbol.asyncIterator
  ]();
  await stream.next();
  await stream.return?.();
  expect(aborted).toBe(true);
});
it('inicia TTS enquanto a geração ainda está aberta e mantém ordem', async () => {
  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let generationFinished = false;
  const spoken: string[] = [];
  const history: CallHistoryRepository = {
    startSession: async () => {},
    endSession: async () => {},
    beginTurn: async () => {},
    updateTurn: async () => {},
    recent: async () => [],
    addSegment: async () => {},
    setAudio: async () => {},
    acknowledge: async () => true,
  };
  const processor = createTurnProcessor(
    {
      execute: async (role, input) => {
        expect(role).toBe('tts');
        spoken.push(input.content);

        if (spoken.length === 1) {
          expect(generationFinished).toBe(false);
          finish();
        }

        return {
          content: '',
          inputTokens: null,
          outputTokens: null,
          audio: {
            pcmBase64: Buffer.alloc(640).toString('base64'),
            sampleRate: 16000,
            channels: 1,
          },
        };
      },
      async *executeStream(input) {
        expect(input.maxTokens).toBe(512);
        yield {
          content: 'Primeira frase. ',
          inputTokens: null,
          outputTokens: null,
        };
        await pending;
        generationFinished = true;
        yield { content: 'Segunda frase.', inputTokens: 10, outputTokens: 5 };
      },
    },
    history,
    createVoiceMetrics(),
  );
  const events: string[] = [];
  await processor.process(
    {
      sessionId: 'session',
      conversationId: 'conversation',
      ownerId: 'owner',
      turnId: 1,
      responseId: 'response',
      dataClass: 'synthetic',
      text: 'oi',
      profile: {
        id: 'profile',
        name: 'original',
        referenceFile: 'reference.wav',
        referenceSha256: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
      },
      signal: new AbortController().signal,
      speechEndedAt: performance.now(),
    },
    { send: (event) => events.push(event.type), audio: async () => {} },
  );
  expect(spoken).toEqual(['Primeira frase.', 'Segunda frase.']);
  expect(events.at(-1)).toBe('reply.done');
});
