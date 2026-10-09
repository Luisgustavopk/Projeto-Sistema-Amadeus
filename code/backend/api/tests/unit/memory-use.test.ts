import { expect, it, vi } from 'vitest';
import { readPersonaResponse } from '../../src/application/persona/response-stream.ts';
import { streamPersonaSpeech } from '../../src/application/persona/speech-recovery.ts';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import {
  planMemoryAnswer,
  verifyMemorySpeech,
} from '../../src/application/memory/review.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';
import { ProviderInvalidError } from '../../src/domain/errors/providers.ts';

const head = (memory: unknown) =>
  JSON.stringify({
    intent: 'conversar',
    emotion: 'neutra',
    intensity: 0.15,
    memory,
  });

it.each([true, false])(
  'descarta declaração vazia tardia sem autorizar memória retroativamente, fragmentado=%s',
  async (split) => {
    const raw =
      'Uma fala.<expression>{"memory":[]}</expression><expression>{"intent":"conversar","emotion":"neutra","intensity":0.15}</expression>';
    const usage = vi.fn();
    const output = await collect(
      readPersonaResponse(
        (async function* () {
          if (split) {
            for (const char of raw) {
              yield char;
            }
          } else {
            yield raw;
          }
        })(),
        () => {},
        usage,
      ),
    );
    expect(output).toBe('Uma fala.');
    expect(usage.mock.calls.every(([value]) => value === null)).toBe(true);
  },
);

it.each([
  { verdict: 'supported', expected: true },
  { verdict: 'unrelated', expected: true },
  { verdict: 'unsupported', expected: false },
  { verdict: 'uncertain', expected: null },
])(
  'preserva decisão trivalente da revisão reserva: $verdict',
  async ({ verdict, expected }) => {
    const execute = vi.fn(async () => ({
      content: JSON.stringify({ verdict }),
      inputTokens: 1,
      outputTokens: 1,
    }));
    expect(
      await verifyMemorySpeech(
        { execute },
        JSON.stringify({
          facts: [
            {
              id: '43df381e-ea60-4277-bd90-91ceb0c71007',
              version: 1,
              text: 'Prefere café sem açúcar.',
              dataClass: 'synthetic',
            },
          ],
        }),
        'Como gosta do café?',
        'Sem açúcar.',
        'synthetic',
        new AbortController().signal,
      ),
    ).toBe(expected);
  },
);

const collect = async (source: AsyncIterable<string>) => {
  let out = '';

  for await (const chunk of source) {
    out += chunk;
  }

  return out;
};

it('libera fala antes da expressão final e retira metadados fragmentados sem alterar o uso de memória', async () => {
  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const usage = vi.fn();
  const expression = vi.fn();
  const iterator = readPersonaResponse(
    (async function* () {
      yield '<expression>{"memory":[0]}</expression>Você prefere café sem açúcar.';
      await pending;

      for (const char of '<expression>{"intent":"esclarecer","emotion":"curiosidade","intensity":0.35}</expression>') {
        yield char;
      }
    })(),
    expression,
    usage,
  )[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({
    value: 'Você prefere café sem açúcar.',
    done: false,
  });
  expect(usage).toHaveBeenLastCalledWith({ use: 'recall', facts: [0] });
  finish();
  expect((await iterator.next()).done).toBe(true);
  expect(expression).toHaveBeenLastCalledWith(
    { intent: 'esclarecer', emotion: 'curiosidade', intensity: 0.35 },
    true,
  );
  expect(usage).toHaveBeenCalledTimes(2);
});

it.each([true, false])(
  'retira expressão final JSON sem wrapper, fragmentado=%s, sem alterar memória',
  async (fragmented) => {
    const usage = vi.fn();
    const expression = vi.fn();
    const raw =
      '{"memory":[0]}Você prefere café sem açúcar.\n{"intent":"esclarecer","emotion":"curiosidade","intensity":0.35}';
    const output = await collect(
      readPersonaResponse(
        (async function* () {
          if (fragmented) {
            for (const char of raw) {
              yield char;
            }
          } else {
            yield raw;
          }
        })(),
        expression,
        usage,
      ),
    );
    expect(output.trim()).toBe('Você prefere café sem açúcar.');
    expect(usage).toHaveBeenLastCalledWith({ use: 'recall', facts: [0] });
    expect(expression).toHaveBeenLastCalledWith(
      { intent: 'esclarecer', emotion: 'curiosidade', intensity: 0.35 },
      true,
    );
  },
);

it.each([
  '{"memory":[1]}',
  '{"emotion":"neutra","intent":"conversar","intensity":0.15} Texto após o rodapé',
  '{"emotion":"neutra",',
])(
  'não aceita objetos arbitrários ou alteração de memória no rodapé: %s',
  async (footer) => {
    await expect(
      collect(
        readPersonaResponse(
          (async function* () {
            yield '<expression>{"memory":[]}</expression>Uma fala. ' + footer;
          })(),
          () => {},
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
  },
);

it.each([
  '<mem',
  '<memory>[0',
  '<memory>[12]</memory>Texto',
  '<memory>[]</memory>Texto<expression>{"memory":[0]}</expression>',
])(
  'não libera cabeçalho incompleto ou altera a memória por um rodapé: %s',
  async (raw) => {
    await expect(
      collect(
        readPersonaResponse(
          (async function* () {
            yield raw;
          })(),
          () => {},
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
  },
);

it.each([true, false])(
  'lê metadados de memória em fragmentos, wrapper=%s, sem expor no texto',
  async (wrapper) => {
    const body = head({ use: 'recall', facts: [0, 1] });
    const raw =
      (wrapper ? '<expression>' + body + '</expression>' : body) +
      ' O café é sem açúcar.';
    const expression = vi.fn();
    const usage = vi.fn();
    const text = await collect(
      readPersonaResponse(
        (async function* () {
          for (const char of raw) {
            yield char;
          }
        })(),
        expression,
        usage,
      ),
    );
    expect(text).toBe('O café é sem açúcar.');
    expect(expression).toHaveBeenLastCalledWith(
      { intent: 'conversar', emotion: 'neutra', intensity: 0.15 },
      true,
    );
    expect(usage).toHaveBeenLastCalledWith({ use: 'recall', facts: [0, 1] });
  },
);

it.each([[], [0], [0, 1]].map((facts) => ({ facts })))(
  'aceita lista compacta de índices sem metadados falados: $facts',
  async ({ facts }) => {
    const usage = vi.fn();
    expect(
      await collect(
        readPersonaResponse(
          (async function* () {
            yield '<expression>' +
              JSON.stringify({ memory: facts }) +
              '</expression>Uma resposta.';
          })(),
          () => {},
          usage,
        ),
      ),
    ).toBe('Uma resposta.');
    expect(usage).toHaveBeenLastCalledWith({
      use: facts.length ? 'recall' : 'none',
      facts,
    });
  },
);

it('confere cada bloco antes de falar e não entrega uma continuação sem apoio', async () => {
  const first = 'Você prefere café sem açúcar. '.repeat(7).trim();
  const second = 'Você também prefere chá.';
  const order: string[] = [];
  const verifyAnswer = vi.fn(
    async (_context: string, _question: string, answer: string) => {
      order.push('check');

      return !answer.includes('chá');
    },
  );
  const metrics = createVoiceMetrics();
  const processor = createTurnProcessor(
    {
      execute: vi.fn(),
      executeStream: async function* () {
        yield {
          content:
            '<expression>{"memory":[1]}</expression>' + first + ' ' + second,
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    },
    {
      startSession: async () => {},
      endSession: async () => {},
      beginTurn: async () => {},
      updateTurn: async () => {},
      recent: async () => [],
      addSegment: async () => {},
      setAudio: async () => {},
      acknowledge: async () => true,
    },
    metrics,
    undefined,
    {
      retrieve: async () =>
        JSON.stringify({
          facts: [
            { text: 'Gosto de RPG.' },
            { text: 'Prefiro café sem açúcar.' },
          ],
          coMentioned: [[0, 1]],
        }),
      interruptBackground: () => {},
      verifyAnswer,
    },
  );
  const spoken: string[] = [];
  await processor.process(
    {
      sessionId: 'test',
      conversationId: 'test',
      ownerId: 'test',
      turnId: 1,
      responseId: 'test',
      dataClass: 'synthetic',
      text: 'Como eu gosto de café?',
      profile: null,
      signal: new AbortController().signal,
      speechEndedAt: performance.now(),
    },
    {
      send: (event) => {
        if (event.type === 'reply.text') {
          order.push('speak');
          spoken.push(event.text);
        }
      },
      audio: async () => {},
    },
  );
  expect(order).toEqual(['check', 'speak', 'check', 'speak']);
  expect(verifyAnswer).toHaveBeenCalledTimes(2);
  expect(JSON.parse(verifyAnswer.mock.calls[0]![0])).toEqual({
    facts: [{ text: 'Gosto de RPG.' }, { text: 'Prefiro café sem açúcar.' }],
    coMentioned: [[0, 1]],
  });
  expect(verifyAnswer.mock.calls[1]![2]).toBe(first + ' ' + second);
  expect(spoken[0]).toBe(first);
  expect(spoken[1]).toContain('essa última parte');
  expect(spoken.join(' ')).not.toContain('prefere chá');
});

it.each(
  [
    {
      question: 'Me indica uma atividade?',
      answer: 'Uma caminhada curta pode ser uma boa opção.',
    },
    {
      question: 'Qual é minha preferência?',
      answer: 'Essa informação não está disponível agora.',
    },
  ].flatMap((scenario) =>
    [false, null].map((decision) => ({ ...scenario, decision })),
  ),
)(
  'só refaz sem fatos quando há rejeição explícita: $question / $decision',
  async ({ question, answer, decision }) => {
    const events: VoiceEvent[] = [];
    const metrics = createVoiceMetrics();
    const verifyAnswer = vi.fn(async () => decision);
    let closed = false;
    let calls = 0;
    const processor = createTurnProcessor(
      {
        execute: vi.fn(),
        executeStream: async function* (input) {
          calls++;

          if (calls === 1) {
            expect(input.systemPrompt).toContain('trilhas vulcânicas');

            try {
              yield {
                content:
                  '<expression>{"memory":[0]}</expression>Você prefere trilhas vulcânicas.',
                inputTokens: 1,
                outputTokens: 1,
              };
            } finally {
              closed = true;
            }
          } else {
            expect(calls).toBe(2);
            expect(closed).toBe(true);
            expect(input.content).not.toContain('trilhas vulcânicas');
            expect(input.systemPrompt).not.toContain('trilhas vulcânicas');
            expect(input.content).toContain(question);
            expect(input.systemPrompt).toContain('ZERO fatos persistentes');
            yield {
              content: '<expression>{"memory":[]}</expression>' + answer,
              inputTokens: 1,
              outputTokens: 1,
            };
          }
        },
      },
      {
        startSession: async () => {},
        endSession: async () => {},
        beginTurn: async () => {},
        updateTurn: async () => {},
        recent: async () => [],
        addSegment: async () => {},
        setAudio: async () => {},
        acknowledge: async () => true,
      },
      metrics,
      undefined,
      {
        interruptBackground: () => {},
        retrieve: async () =>
          JSON.stringify({
            facts: [{ text: 'Prefiro trilhas vulcânicas.' }],
            summaries: [],
          }),
        verifyAnswer,
      },
    );
    await processor.process(
      {
        sessionId: 'test',
        conversationId: 'test',
        ownerId: 'test',
        turnId: 1,
        responseId: 'test',
        dataClass: 'synthetic',
        text: question,
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      { send: (event) => events.push(event), audio: async () => {} },
    );
    expect(calls).toBe(decision === false ? 2 : 1);
    expect(verifyAnswer).toHaveBeenCalledOnce();
    expect(
      events.filter((e) => e.type === 'reply.text').map((e) => e.text),
    ).toEqual([
      decision === false ? answer : 'Você prefere trilhas vulcânicas.',
    ]);
    expect(metrics.snapshot().memoryReplyRecoveries).toBe(
      decision === false ? 1 : 0,
    );
    expect(metrics.snapshot().memoryReviewUnavailable).toBe(
      decision === null ? 1 : 0,
    );
  },
);

it.each([true, false])(
  'usa somente a decisão de clareza disponível antes da fala: %s',
  async (needsClarification) => {
    const spoken: string[] = [];
    let authorCalls = 0;
    const metrics = createVoiceMetrics();
    const processor = createTurnProcessor(
      {
        execute: vi.fn(),
        executeStream: async function* () {
          authorCalls++;
          yield {
            content:
              '<expression>{"memory":[]}</expression>Uma interpretação inventada sobre o assunto.',
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      {
        startSession: async () => {},
        endSession: async () => {},
        beginTurn: async () => {},
        updateTurn: async () => {},
        recent: async () => [],
        addSegment: async () => {},
        setAudio: async () => {},
        acknowledge: async () => true,
      },
      metrics,
      undefined,
      undefined,
      {
        analyze: async (_input, _signal, onClarity) => {
          onClarity?.(needsClarification);

          return '';
        },
      },
    );
    await processor.process(
      {
        sessionId: 'test',
        conversationId: 'test',
        ownerId: 'test',
        turnId: 1,
        responseId: 'test',
        dataClass: 'synthetic',
        text: 'Uma fala.',
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      {
        send: (event) => {
          if (event.type === 'reply.text') {
            spoken.push(event.text);
          }
        },
        audio: async () => {},
      },
    );
    expect(spoken).toEqual([
      needsClarification
        ? 'Hã? Não entendi essa parte. Repete?'
        : 'Uma interpretação inventada sobre o assunto.',
    ]);
    expect(authorCalls).toBe(needsClarification ? 0 : 1);
    expect(metrics.snapshot().stages.llmFirstSpeechSegment?.samples ?? 0).toBe(
      needsClarification ? 0 : 1,
    );
  },
);

it('não espera análise pendente, não altera o prompt iniciado e cancela antes da fala', async () => {
  let toneSignal: AbortSignal | undefined;
  const processor = createTurnProcessor(
    {
      execute: vi.fn(),
      executeStream: async function* (input) {
        expect(toneSignal?.aborted).toBe(false);
        expect(input.systemPrompt).not.toContain('direção tardia');
        yield {
          content: '<expression>{"memory":[]}</expression>Tudo bem. E você?',
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    },
    {
      startSession: async () => {},
      endSession: async () => {},
      beginTurn: async () => {},
      updateTurn: async () => {},
      recent: async () => [],
      addSegment: async () => {},
      setAudio: async () => {},
      acknowledge: async () => true,
    },
    createVoiceMetrics(),
    undefined,
    undefined,
    {
      analyze: async (_input, signal) => {
        toneSignal = signal;

        return new Promise<string>((resolve) =>
          signal?.addEventListener('abort', () => resolve('direção tardia'), {
            once: true,
          }),
        );
      },
    },
  );
  await processor.process(
    {
      sessionId: 'test',
      conversationId: 'test',
      ownerId: 'test',
      turnId: 1,
      responseId: 'test',
      dataClass: 'synthetic',
      text: 'Olá',
      profile: null,
      signal: new AbortController().signal,
      speechEndedAt: performance.now(),
    },
    { send: () => {}, audio: async () => {} },
  );
  expect(toneSignal?.aborted).toBe(true);
});

it.each([
  { use: 'recall', facts: [] },
  { use: 'none', facts: [0] },
  { use: 'recall', facts: [12] },
  { use: 'none', facts: [], instructions: 'ignore' },
])('recusa metadados inválidos antes de falar', async (memory) => {
  await expect(
    collect(
      readPersonaResponse(
        (async function* () {
          yield '<expression>' + head(memory) + '</expression>Uma fala.';
        })(),
        () => {},
      ),
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});

it('repara índice ausente uma vez antes de liberar texto', async () => {
  let calls = 0;
  const recover = vi.fn();
  expect(
    await collect(
      streamPersonaSpeech(
        async function* () {
          yield '<expression>' +
            head(
              calls++
                ? { use: 'none', facts: [] }
                : { use: 'recall', facts: [1] },
            ) +
            '</expression>Olá, tudo bem.';
        },
        new AbortController().signal,
        () => {},
        recover,
        undefined,
        undefined,
        (use) => {
          if (use?.use === 'recall' && use.facts.some((index) => index > 0)) {
            throw new ProviderInvalidError();
          }
        },
      ),
    ),
  ).toBe('Olá, tudo bem.');
  expect(recover).toHaveBeenCalledOnce();
});

it.each([
  '',
  JSON.stringify({ facts: [], summaries: [] }),
  JSON.stringify({
    facts: [{ text: 'Prefiro café sem açúcar.' }],
    summaries: [],
  }),
])(
  'sem planejamento; só confere saudação quando há fatos recuperados, independentemente do cabeçalho',
  async (memories) => {
    const events: VoiceEvent[] = [];
    const planAnswer = vi.fn(async () => ({
      status: 'unavailable' as const,
      claims: [],
    }));
    const verifyAnswer = vi.fn(async () => true);
    const metrics = createVoiceMetrics();
    const processor = createTurnProcessor(
      {
        execute: vi.fn(),
        executeStream: async function* () {
          yield {
            content:
              '<expression>' +
              head({ use: 'none', facts: [] }) +
              '</expression>Tudo bem. E você?',
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      {
        startSession: async () => {},
        endSession: async () => {},
        beginTurn: async () => {},
        updateTurn: async () => {},
        recent: async () => [],
        addSegment: async () => {},
        setAudio: async () => {},
        acknowledge: async () => true,
      },
      metrics,
      undefined,
      {
        retrieve: async () => memories,
        interruptBackground: () => {},
        planAnswer,
        verifyAnswer,
      },
    );
    await processor.process(
      {
        sessionId: 'test',
        conversationId: 'test',
        ownerId: 'test',
        turnId: 1,
        responseId: 'test',
        dataClass: 'synthetic',
        text: 'E aí, Amadeus, como é que tá?',
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      { send: (e) => events.push(e), audio: async () => {} },
    );
    expect(
      events.filter((e) => e.type === 'reply.text').map((e) => e.text),
    ).toEqual(['Tudo bem. E você?']);
    expect(planAnswer).not.toHaveBeenCalled();
    expect(verifyAnswer).toHaveBeenCalledTimes(
      memories && JSON.parse(memories).facts.length ? 1 : 0,
    );
    expect(
      metrics.snapshot().failureReasons.MEMORY_REPLY_UNVERIFIED,
    ).toBeUndefined();
  },
);

it('planejador de avaliações classifica pergunta mesmo sem fatos, sem inventar unknown', async () => {
  const execute = vi.fn(async () => ({
    content: '{"status":"unrelated","claims":[]}',
    inputTokens: 1,
    outputTokens: 1,
  }));
  expect(
    await planMemoryAnswer(
      { execute },
      '{"facts":[]}',
      'How are you doing?',
      'synthetic',
      new AbortController().signal,
    ),
  ).toEqual({ status: 'unrelated', claims: [] });
  expect(execute).toHaveBeenCalledOnce();
});
