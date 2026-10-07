import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import { QuotaExceededError } from '../../src/domain/errors/providers.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';
import { VoicePayload } from '../../src/realtime/protocol/voice-server-events.ts';

vi.mock('../../src/application/voice/provider-wait.ts', () => ({
  providerWaitPhrase: () => 'Hmm, só um momento.',
}));
vi.mock('../../src/application/voice/provider-wait-audio.ts', () => ({
  providerWaitAudio: () => Buffer.alloc(640),
}));

function fixture(stream: ProviderServices['executeStream']) {
  const spoken: string[] = [];
  const segments: { position: number; text: string }[] = [];
  const events: VoiceEvent[] = [];
  const updates: unknown[] = [];
  const abort = new AbortController();
  const history: CallHistoryRepository = {
    startSession: async () => {},
    endSession: async () => {},
    beginTurn: async () => {},
    recent: async () => [],
    acknowledge: async () => true,
    updateTurn: async (_id, update) => {
      updates.push(update);
    },
    addSegment: async (segment) => {
      segments.push(segment);
    },
    setAudio: async () => {},
  };
  const execute = vi.fn<ProviderServices['execute']>(async (role) => {
    expect(role).toBe('tts');

    return {
      content: '',
      inputTokens: null,
      outputTokens: null,
      audio: {
        pcmBase64: Buffer.alloc(640).toString('base64'),
        sampleRate: 24000,
        channels: 1,
      },
    };
  });
  const processor = createTurnProcessor(
    { execute, executeStream: stream },
    history,
    createVoiceMetrics(),
  );
  const responseId = randomUUID();
  const audio = vi.fn(async () => {});
  const run = () =>
    processor.process(
      {
        sessionId: randomUUID(),
        conversationId: randomUUID(),
        ownerId: 'primary',
        turnId: 1,
        responseId,
        dataClass: 'synthetic',
        text: 'Explique a hipótese.',
        profile: {
          id: randomUUID(),
          name: 'original',
          referenceFile: 'reference.wav',
          referenceSha256: 'a'.repeat(64),
          createdAt: new Date().toISOString(),
        },
        signal: abort.signal,
        speechEndedAt: performance.now(),
      },
      {
        send: (event) => {
          VoicePayload.parse(event);
          events.push(event);

          if (event.type === 'reply.text') {
            spoken.push(event.text);
          }
        },
        audio,
      },
    );

  return {
    run,
    spoken,
    segments,
    events,
    updates,
    responseId,
    abort,
    audio,
    execute,
  };
}

const chunk = (content: string) => ({
  content,
  inputTokens: null,
  outputTokens: null,
});
const fallback = {
  fromProvider: 'groq' as const,
  fromModel: 'primary',
  toProvider: 'cloudflare-ai' as const,
  toModel: 'reserve',
  reason: 'QUOTA_EXCEEDED' as const,
};

it('fala um preset uma única vez e conclui a resposta reserva no mesmo turno', async () => {
  const f = fixture(async function* (_input, _signal, options) {
    await options?.onFallback?.(fallback);
    await options?.onFallback?.(fallback);
    yield chunk('Essa hipótese precisa de evidências.');
  });
  await f.run();
  expect(f.spoken).toEqual([
    'Hmm, só um momento.',
    'Essa hipótese precisa de evidências.',
  ]);
  expect(f.segments.map((segment) => segment.position)).toEqual([0, 1]);
  expect(f.events.filter((event) => event.type === 'reply.wait')).toHaveLength(
    1,
  );
  expect(f.events.filter((event) => event.type === 'reply.start')).toHaveLength(
    1,
  );
  expect(f.events.at(-1)).toEqual({
    type: 'reply.done',
    turnId: 1,
    responseId: f.responseId,
  });
  expect(f.audio).toHaveBeenCalledTimes(2);
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.updates).toContainEqual({ status: 'completed' });
});

it('descarta cabeçalho parcial de um modelo sem cota e reinicia a leitura pela reserva', async () => {
  let attempts = 0;
  const f = fixture(async function* () {
    if (++attempts === 1) {
      yield chunk('<expression>{"intent":"conversar"');

      throw new QuotaExceededError();
    }

    yield chunk('Vamos testar essa hipótese.');
  });
  await f.run();
  expect(attempts).toBe(2);
  expect(f.spoken).toEqual([
    'Hmm, só um momento.',
    'Vamos testar essa hipótese.',
  ]);
  expect(f.events.at(-1)?.type).toBe('reply.done');
});

it('continua após fala parcial sem reiniciar o trecho que já foi fornecido', async () => {
  let attempts = 0;
  const first =
    'Essa primeira parte apresenta uma hipótese e suas evidências. '.repeat(4);
  const f = fixture(async function* (input) {
    if (++attempts === 1) {
      yield chunk(first);

      throw new QuotaExceededError();
    }

    const prefix = f.spoken
      .filter((text) => text !== 'Hmm, só um momento.')
      .join(' ');
    expect(input.content).toContain(JSON.stringify({ assistant: prefix }));
    expect(input.content).not.toContain('Hmm, só um momento.');
    expect(input.systemPrompt).toContain('Continue a resposta');
    yield chunk('Agora podemos testar a previsão resultante.');
  });
  await f.run();
  expect(attempts).toBe(2);
  expect(
    f.spoken.filter((text) => text === 'Hmm, só um momento.'),
  ).toHaveLength(1);
  expect(f.spoken.at(-1)).toBe('Agora podemos testar a previsão resultante.');
  expect(f.segments.map((segment) => segment.position)).toEqual(
    f.segments.map((_segment, index) => index),
  );
  expect(f.events.at(-1)?.type).toBe('reply.done');
});

it('não declara conclusão só por falar o preset quando todas as reservas falham', async () => {
  let attempts = 0;
  const f = fixture(async function* () {
    attempts++;

    throw new QuotaExceededError();
    yield chunk('');
  });
  await expect(f.run()).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(attempts).toBe(2);
  expect(f.spoken).toEqual(['Hmm, só um momento.']);
  expect(f.events.some((event) => event.type === 'reply.done')).toBe(false);
  expect(f.updates).not.toContainEqual({ status: 'completed' });
});

it('interrompe também o preset e não deixa a resposta da reserva tocar depois', async () => {
  const f = fixture(async function* (_input, _signal, options) {
    await options?.onFallback?.(fallback);
    yield chunk('Não deve ser reproduzido.');
  });
  f.audio.mockImplementationOnce(async () => {
    f.abort.abort();
  });
  await expect(f.run()).rejects.toBeDefined();
  expect(f.spoken).toEqual(['Hmm, só um momento.']);
  expect(f.events.some((event) => event.type === 'reply.done')).toBe(false);
});
