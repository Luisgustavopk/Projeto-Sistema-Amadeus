import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';

it.each(['recall', 'none', 'missing'] as const)(
  'usa escopo %s no turno sem planejamento extra e mantém metadados fora da fala',
  async (status) => {
    const factId = randomUUID();
    const planner = vi.fn(async () => ({
      status: 'unavailable' as const,
      claims: [],
    }));
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
    const executeStream = vi.fn<ProviderServices['executeStream']>(
      async function* (input) {
        expect(planner).not.toHaveBeenCalled();
        expect(input.content).not.toContain('Plano factual');
        expect(input.systemPrompt).toContain('CONTEXTO DE MEMÓRIA');
        yield {
          content:
            '<expression>' +
            JSON.stringify({
              intent: 'conversar',
              emotion: 'neutra',
              intensity: 0.15,
              ...(status === 'missing'
                ? {}
                : {
                    memory: {
                      use: status,
                      facts: status === 'recall' ? [0] : [],
                    },
                  }),
            }) +
            '</expression>Posso responder com os dados disponíveis.',
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    );
    const events: VoiceEvent[] = [],
      audio = vi.fn();
    const metrics = createVoiceMetrics();
    const verify = vi.fn(async () => {
      expect(events.filter((e) => e.type === 'reply.text')).toEqual([]);

      return status !== 'missing';
    });
    const processor = createTurnProcessor(
      { execute: vi.fn(), executeStream },
      history,
      metrics,
      undefined,
      {
        retrieve: async () =>
          JSON.stringify({
            facts: [{ id: factId, text: 'O projeto Farol usa PostgreSQL.' }],
            summaries: [],
          }),
        interruptBackground: () => {},
        planAnswer: planner,
        verifyAnswer: verify,
      },
    );
    await processor.process(
      {
        sessionId: randomUUID(),
        conversationId: randomUUID(),
        ownerId: 'primary',
        turnId: 1,
        responseId: randomUUID(),
        dataClass: 'synthetic',
        text: 'Qual banco meu projeto usa?',
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      { send: (e) => events.push(e), audio },
    );
    expect(
      events
        .filter((e) => e.type === 'reply.text')
        .map((e) => e.text)
        .join(''),
    ).toBe('Posso responder com os dados disponíveis.');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(executeStream).toHaveBeenCalledTimes(status === 'missing' ? 2 : 1);

    if (status === 'missing') {
      expect(executeStream.mock.calls[1]![0].content).not.toContain(
        'PostgreSQL',
      );
    }

    expect(audio).not.toHaveBeenCalled();
    expect(metrics.snapshot().stages.memoryPlan).toBeUndefined();
    expect(metrics.snapshot().stages.memoryRetrieve?.samples).toBe(1);
  },
);
