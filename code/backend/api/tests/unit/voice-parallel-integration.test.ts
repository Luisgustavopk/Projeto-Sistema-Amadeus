import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSegmentExpressionObserver } from '../../src/application/persona/segment-expression.ts';
import { createExpressionClassifier } from '../../src/application/persona/expression-classifier.ts';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import { conversationAuthor } from '../../src/application/providers/conversation-author.ts';
import {
  DEFAULT_PROVIDERS,
  ProviderSchema,
} from '../../src/domain/providers/model.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type {
  ProviderFactory,
  ProviderInput,
} from '../../src/ports/provider.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';
import type { ProviderUsageRepository } from '../../src/ports/provider-usage-repository.ts';

const context = {
  user: 'Você tem certeza?',
  history: [],
  dataClass: 'synthetic' as const,
  personalConsent: false,
};
const expression = {
  intent: 'discordar',
  emotion: 'ceticismo',
  intensity: 0.35,
};
const target = { segmentId: randomUUID(), position: 0 };

it('não aguarda classificação e associa o resultado ao segmento original', async () => {
  let resolve!: (value: unknown) => void;
  const onResult = vi.fn();
  const observer = createSegmentExpressionObserver({
    context,
    timeoutMs: 2000,
    signal: new AbortController().signal,
    classifier: {
      classify: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
    onResult,
    onFailure: vi.fn(),
  });
  observer.observe('Não basta querer que seja verdade.', target);
  expect(onResult).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  resolve(expression);
  await vi.waitFor(() =>
    expect(onResult).toHaveBeenCalledWith(target, expression),
  );
  observer.dispose();
});

it('descarta resultado após interrupção mesmo quando o classificador ignora o abort', async () => {
  let resolve!: (value: unknown) => void;
  const controller = new AbortController();
  const onResult = vi.fn();
  const observer = createSegmentExpressionObserver({
    context,
    timeoutMs: 2000,
    signal: controller.signal,
    classifier: {
      classify: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
    onResult,
    onFailure: vi.fn(),
  });
  observer.observe('Uma fala interrompida.', target);
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  controller.abort();
  resolve(expression);
  await Promise.resolve();
  await Promise.resolve();
  expect(onResult).not.toHaveBeenCalled();
});

it('limita concorrência e expira sem bloquear caso o transporte nunca responda', async () => {
  vi.useFakeTimers();

  try {
    const onFailure = vi.fn();
    const classify = vi.fn(() => new Promise<unknown>(() => {}));
    const observer = createSegmentExpressionObserver({
      context,
      timeoutMs: 100,
      signal: new AbortController().signal,
      classifier: { classify },
      onResult: vi.fn(),
      onFailure,
    });

    for (let position = 0; position < 3; position++) {
      observer.observe('Uma frase.', { ...target, position });
    }

    await vi.advanceTimersByTimeAsync(101);
    expect(classify).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith('EXPRESSION_OBSERVER_BUSY');
    expect(onFailure).toHaveBeenCalledWith('EXPRESSION_OBSERVER_TIMEOUT');
    observer.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it('rejeita observação pessoal sem consentimento e local-only antes de consultar provedores', async () => {
  const get = vi.fn();
  const classifier = createExpressionClassifier({
    configuration: { get, save: vi.fn() },
    usage: { reserve: vi.fn(), settle: vi.fn(), usage: vi.fn() },
    ownerId: 'owner',
    factory: vi.fn(),
    gate: { beginExecution: () => () => {} },
  });

  for (const dataClass of ['personal', 'local-only'] as const) {
    await expect(
      classifier.classify(
        { ...context, speech: 'Dado privado.', dataClass },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DATA_POLICY_BLOCKED' });
  }

  expect(get).not.toHaveBeenCalled();
});

const paid = ProviderSchema.parse({
  adapter: 'openrouter',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  model: 'meta-llama/llama-3.3-70b-instruct',
  openRouterPaid: { maxPromptPrice: 0.1, maxCompletionPrice: 0.32 },
  limits: { enforced: false, requestsPerDay: 50, tokensPerDay: 200000 },
});

it('observador usa DeepSeek, contabilização própria e JSON, sem alterar a configuração do autor', async () => {
  const reserve = vi.fn<ProviderUsageRepository['reserve']>(
    async () => 'reservation',
  );
  const settle = vi.fn();
  const execute = vi.fn(async () => ({
    content: JSON.stringify(expression),
    inputTokens: 7,
    outputTokens: 9,
  }));
  const factory = vi.fn(() => ({ execute })) as unknown as ProviderFactory;
  const classifier = createExpressionClassifier({
    configuration: {
      get: async () => ({ ...DEFAULT_PROVIDERS, llm: paid }),
      save: vi.fn(),
    },
    usage: { reserve, settle, usage: vi.fn() },
    ownerId: 'owner',
    factory,
    gate: { beginExecution: () => () => {} },
  });
  expect(
    await classifier.classify(
      { ...context, speech: 'Isso não é evidência.' },
      new AbortController().signal,
    ),
  ).toEqual(expression);
  expect(reserve.mock.calls[0]?.[0]).toBe('owner:expression');
  expect(factory).toHaveBeenCalledWith(
    'llm',
    expect.objectContaining({ model: 'deepseek/deepseek-v4.1-flash' }),
  );
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: 'expression', maxTokens: 160 }),
    expect.any(AbortSignal),
  );
  expect(settle).toHaveBeenCalledWith(
    'reservation',
    expect.objectContaining({ inputTokens: 7 }),
  );
  expect(paid.model).toBe('meta-llama/llama-3.3-70b-instruct');
});

it('escolha manual preserva reservas e política sem permitir ativar pagamento em uma configuração gratuita', () => {
  expect(conversationAuthor(paid, 'deepseek')).toMatchObject({
    model: 'deepseek/deepseek-v4.1-flash',
    limits: { enforced: false },
  });
  expect(() => conversationAuthor(DEFAULT_PROVIDERS.llm, 'deepseek')).toThrow();
  expect(
    ProviderSchema.safeParse({ ...paid, model: 'arbitrary/paid' }).success,
  ).toBe(false);
});

async function processorFixture(
  rejectMemory = false,
  expressive = false,
  nativeDelivery = true,
  preferredAddressName?: string,
) {
  const events: VoiceEvent[] = [];
  const inputs: ProviderInput[] = [];
  const execute = vi.fn(async (_role: unknown, input: ProviderInput) => ({
    ...(nativeDelivery && input.speechExpression
      ? { speechExpressionApplied: input.speechExpression }
      : {}),
    content: '',
    inputTokens: 0,
    outputTokens: 0,
    audio: {
      pcmBase64: Buffer.alloc(640).toString('base64'),
      sampleRate: 16000 as const,
      channels: 1 as const,
    },
  }));
  const history: CallHistoryRepository = {
    startSession: vi.fn(),
    endSession: vi.fn(),
    beginTurn: vi.fn(),
    updateTurn: vi.fn(),
    recent: async () => [],
    addSegment: vi.fn(),
    setAudio: vi.fn(),
    acknowledge: async () => true,
  };
  let finish!: (value: unknown) => void;
  const classify = vi.fn(
    () =>
      new Promise<unknown>((resolve) => {
        finish = resolve;
      }),
  );
  const verify = vi.fn(async () => false);
  const processor = createTurnProcessor(
    {
      execute,
      async *executeStream(input) {
        inputs.push(input);
        yield {
          content:
            rejectMemory && inputs.length === 1
              ? '<expression>{"memory":{"use":"recall","facts":[0]}}</expression>Você gosta de chá.'
              : (expressive
                  ? '<expression>{"intent":"limitar","emotion":"raiva","intensity":0.8,"memory":{"use":"none","facts":[]}}</expression>'
                  : '') + 'Hmm… isso ainda precisa de evidência.',
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    },
    history,
    createVoiceMetrics(),
    preferredAddressName
      ? {
          get: async () => ({
            version: 'test',
            revision: 1,
            direction: '',
            updatedAt: null,
            preferredAddressName,
          }),
        }
      : undefined,
    rejectMemory
      ? {
          interruptBackground: vi.fn(),
          retrieve: async () =>
            JSON.stringify({ facts: [{ text: 'Prefere café.' }] }),
          verifyAnswer: verify,
          reviewMode: async () => 'strict' as const,
        }
      : undefined,
    undefined,
    undefined,
    undefined,
    {
      get: async () => ({
        options: {
          expressionMode: expressive ? 'expressive' : 'parallel',
          actingMode: 'refined',
          firstFlushMs: 200,
          observerTimeoutMs: 2000,
          observerPersonalConsent: false,
        },
      }),
      classifier: { classify },
    },
  );
  const controller = new AbortController();
  await processor.process(
    {
      sessionId: randomUUID(),
      conversationId: randomUUID(),
      ownerId: 'owner',
      turnId: 1,
      responseId: randomUUID(),
      dataClass: preferredAddressName ? 'personal' : 'synthetic',
      text: 'Você tem certeza?',
      profile: {
        id: randomUUID(),
        name: 'test',
        referenceFile: 'test.wav',
        referenceSha256: '0'.repeat(64),
        createdAt: new Date().toISOString(),
      },
      signal: controller.signal,
      speechEndedAt: performance.now(),
    },
    { send: (event) => events.push(event), audio: async () => {} },
  );

  return { events, inputs, execute, classify, verify, finish, controller };
}

it('modo expressivo leva a reação do autor ao TTS sem classificador adicional', async () => {
  const f = await processorFixture(false, true);
  expect(f.classify).not.toHaveBeenCalled();
  expect(f.execute).toHaveBeenCalledWith(
    'tts',
    expect.objectContaining({
      speechExpression: { intent: 'limitar', emotion: 'raiva', intensity: 0.8 },
    }),
    expect.any(AbortSignal),
  );
  const text = f.events.find((e) => e.type === 'reply.text');
  expect(
    f.events.find((e) => e.type === 'reply.expression' && e.deliveryApplied),
  ).toMatchObject({
    phase: 'update',
    segmentId: text && 'segmentId' in text ? text.segmentId : null,
  });
  f.controller.abort();
});

it('não declara controle aplicado se a reserva não implementa a expressão', async () => {
  const f = await processorFixture(false, true, false);
  expect(
    f.events.some((e) => e.type === 'reply.expression' && e.deliveryApplied),
  ).toBe(false);
  f.controller.abort();
});

it('preserva atuação e vocativo no reparo sem fatos e fornece a preferência ao revisor', async () => {
  const f = await processorFixture(true, false, true, 'Alex');
  expect(f.inputs).toHaveLength(2);

  for (const input of f.inputs) {
    expect(input.systemPrompt).toContain('Ficha experimental de Amadeus');
    expect(input.systemPrompt).toContain('"preferredAddressName":"Alex"');
  }

  expect(f.verify.mock.calls[0]?.at(-1)).toBe('Alex');
  f.controller.abort();
});

it('áudio e resposta completa são liberados antes dos metadados, que atualizam o mesmo segmento', async () => {
  const f = await processorFixture();
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.events.at(-1)?.type).toBe('reply.done');
  expect(f.inputs[0]?.systemPrompt).not.toContain('FORMATO OBRIGATÓRIO');
  expect(
    f.events.some((e) => e.type === 'reply.expression' && e.phase === 'update'),
  ).toBe(false);
  f.finish(expression);
  await vi.waitFor(() =>
    expect(
      f.events.some(
        (e) => e.type === 'reply.expression' && e.phase === 'update',
      ),
    ).toBe(true),
  );
  const text = f.events.find((e) => e.type === 'reply.text');
  expect(
    f.events.find((e) => e.type === 'reply.expression' && e.phase === 'update'),
  ).toMatchObject({
    segmentId: text && 'segmentId' in text ? text.segmentId : null,
    ...expression,
  });
  f.controller.abort();
});

it('não envia rascunho de memória rejeitado ao TTS ou ao classificador e recupera sem os fatos', async () => {
  const f = await processorFixture(true);
  expect(f.verify).toHaveBeenCalledTimes(1);
  expect(f.inputs).toHaveLength(2);
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.classify).toHaveBeenCalledWith(
    expect.objectContaining({
      speech: 'Hmm… isso ainda precisa de evidência.',
    }),
    expect.any(AbortSignal),
  );
  expect(
    f.events
      .filter((e) => e.type === 'reply.text')
      .map((e) => e.text)
      .join(' '),
  ).not.toContain('chá');
  f.controller.abort();
});
