import { expect, it, vi } from 'vitest';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';

it.each([true, false])(
  'revogação antes da geração=%s: não envia o rascunho e regenera no máximo uma vez',
  async (beforeGeneration) => {
    const events: VoiceEvent[] = [],
      prompts: string[] = [];
    let validations = 0;
    const verifyAnswer = vi.fn(async () => true);
    const processor = createTurnProcessor(
      {
        execute: vi.fn(),
        executeStream: async function* (input) {
          prompts.push(input.systemPrompt ?? '');
          yield {
            content:
              '<expression>{"memory":[]}</expression>' +
              (input.systemPrompt?.includes('Revocable source.')
                ? 'Unreleased draft.'
                : 'A general answer.'),
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
      {
        retrieve: async () =>
          JSON.stringify({
            facts: [{ id: 'fixture', version: 1, text: 'Revocable source.' }],
          }),
        interruptBackground: () => {},
        reviewMode: async () => 'selective',
        verifyAnswer,
        validateContext: async () => ++validations === 1 && !beforeGeneration,
      },
    );
    await processor.process(
      {
        sessionId: 's',
        conversationId: 'c',
        ownerId: 'o',
        responseId: 'r',
        turnId: 1,
        text: 'Recommend something.',
        dataClass: 'synthetic',
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      { send: (event) => events.push(event), audio: async () => {} },
    );
    expect(prompts).toHaveLength(beforeGeneration ? 1 : 2);
    expect(prompts.at(-1)).not.toContain('Revocable source.');
    expect(
      events.filter((e) => e.type === 'reply.text').map((e) => e.text),
    ).toEqual(['A general answer.']);
    expect(verifyAnswer).not.toHaveBeenCalled();
  },
);

it.each([
  { header: '[]', mode: 'selective' as const, checks: 0 },
  {
    header: '{"use":"context","facts":[0]}',
    mode: 'selective' as const,
    checks: 0,
  },
  { header: '[0]', mode: 'selective' as const, checks: 1 },
  { header: '[]', mode: 'strict' as const, checks: 1 },
])(
  'revisão $mode com $header: mantém permissões e chama o juiz $checks vez(es)',
  async ({ header, mode, checks }) => {
    const verifyAnswer = vi.fn(async () => true);
    const validateContext = vi.fn(async () => true);
    const metrics = createVoiceMetrics();
    const events: VoiceEvent[] = [];
    const processor = createTurnProcessor(
      {
        execute: vi.fn(),
        executeStream: async function* (input) {
          expect(input.content).toBe('Me indica uma opção.');
          expect(input.systemPrompt).toContain(
            'O participante gosta de exploração.',
          );
          yield {
            content: `<expression>{"memory":${header}}</expression>Uma investigação pode ser interessante.`,
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
              {
                id: 'fixture',
                version: 1,
                text: 'O participante gosta de exploração.',
              },
            ],
          }),
        interruptBackground: () => {},
        reviewMode: async () => mode,
        validateContext,
        verifyAnswer,
      },
    );
    await processor.process(
      {
        sessionId: 's',
        conversationId: 'c',
        ownerId: 'o',
        responseId: 'r',
        turnId: 1,
        text: 'Me indica uma opção.',
        dataClass: 'synthetic',
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      { send: (event) => events.push(event), audio: async () => {} },
    );
    expect(verifyAnswer).toHaveBeenCalledTimes(checks);
    expect(validateContext).toHaveBeenCalled();
    expect(events.some((event) => event.type === 'reply.done')).toBe(true);
    expect(metrics.snapshot().memoryReviewSkipped).toBe(checks ? 0 : 1);
  },
);

it('um rodapé artístico com rótulo desconhecido não invalida fala já entregue', async () => {
  const { readPersonaResponse } =
    await import('../../src/application/persona/response-stream.ts');
  const onExpression = vi.fn();
  const texts = [];

  for await (const text of readPersonaResponse(
    (async function* () {
      yield '<expression>{"memory":[]}</expression>Oi.<expression>{"intent":"rótulo_inexistente","emotion":"neutra","intensity":0.2}</expression>';
    })(),
    onExpression,
  )) {
    texts.push(text);
  }

  expect(texts.join('')).toBe('Oi.');
  expect(onExpression).toHaveBeenLastCalledWith(
    expect.objectContaining({ emotion: 'neutra' }),
    false,
  );
});
