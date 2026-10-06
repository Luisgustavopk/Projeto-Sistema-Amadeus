import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';

it.each(['answerable', 'unknown', 'unavailable', 'unrelated'] as const)(
  'integra plano %s no turno antes da geração e mantém metadados fora da fala',
  async (status) => {
    const factId = randomUUID();
    const plan: Awaited<
      ReturnType<
        import('../../src/application/memory/service.ts').MemoryService['planAnswer']
      >
    > =
      status === 'unavailable'
        ? { status: 'unavailable', claims: [] }
        : {
            status,
            claims:
              status === 'answerable'
                ? [
                    {
                      text: 'O projeto Farol usa PostgreSQL.',
                      factIds: [factId],
                    },
                  ]
                : [],
          };
    const planner = vi.fn(async () => plan);
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
        expect(planner).toHaveBeenCalledTimes(1);
        expect(input.content).toContain(JSON.stringify(plan));
        expect(input.systemPrompt).toContain('PLANO FACTUAL');
        yield {
          content: 'Posso responder com os dados disponíveis.',
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

      return status === 'answerable';
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
    ).toBe(
      status === 'answerable' || status === 'unrelated'
        ? 'Posso responder com os dados disponíveis.'
        : 'Não consegui confirmar esse detalhe nas minhas lembranças agora. Pode me lembrar?',
    );
    expect(verify).toHaveBeenCalledTimes(status === 'unrelated' ? 0 : 1);
    expect(audio).not.toHaveBeenCalled();
    expect(metrics.snapshot().stages.memoryPlan?.samples).toBe(1);
  },
);
