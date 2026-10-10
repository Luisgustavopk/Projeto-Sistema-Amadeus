import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/index.ts';
import { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import { toneDirection } from '../../src/application/persona/tone-rubric.ts';
import { ProviderInvalidError } from '../../src/domain/errors/providers.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';

const token = 'test-only-credential-of-more-than-32-characters';
const headers = { authorization: `Bearer ${token}` };

it('protege análise, rejeita dados pessoais sem revisão e edições conflitantes', async () => {
  const app = await buildApp({
    token,
    config: loadConfig({ API_ACCESS_TOKEN: token }),
  });

  try {
    expect(
      (await app.inject({ method: 'GET', url: '/v1/persona/analysis' }))
        .statusCode,
    ).toBe(401);
    const initial = (
      await app.inject({ method: 'GET', url: '/v1/persona/analysis', headers })
    ).json();
    expect(initial.configuration.enabled).toBe(false);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/persona/analysis',
          headers,
          payload: {
            revision: 0,
            configuration: { enabled: true, dataPolicy: 'personal-approved' },
          },
        })
      ).statusCode,
    ).toBe(400);
    const edit = { revision: 0, configuration: { enabled: true } };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/persona/analysis',
          headers,
          payload: edit,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/persona/analysis',
          headers,
          payload: edit,
        })
      ).statusCode,
    ).toBe(409);
    const saved = (
      await app.inject({ method: 'GET', url: '/v1/persona/analysis', headers })
    ).json();
    expect(saved).toMatchObject({
      revision: 1,
      configuration: { enabled: true },
      model: 'typesafe/jev-1.13',
      usage: { requests: 0 },
    });
  } finally {
    await app.close();
  }
});

it.each([false, true])(
  'injeta direção curada na fala, inclusive após reparo de formato=%s, sem anexá-la ao histórico',
  async (recover) => {
    const events: VoiceEvent[] = [];
    const persisted: unknown[] = [];
    const direction = toneDirection('frustration');
    const analyze = vi.fn(async () => direction);
    const history: CallHistoryRepository = {
      startSession: async () => {},
      endSession: async () => {},
      beginTurn: async () => {},
      recent: async () => [],
      addSegment: async () => {},
      setAudio: async () => {},
      acknowledge: async () => true,
      updateTurn: async (_id, update) => {
        persisted.push(update);
      },
    };
    let attempts = 0;
    const stream = vi.fn<ProviderServices['executeStream']>(
      async function* (input) {
        expect(input.systemPrompt).toContain(direction);
        expect(input.systemPrompt!.split(direction)).toHaveLength(2);
        attempts++;

        if (recover && attempts === 1) {
          throw new ProviderInvalidError();
        }

        yield {
          content: 'Entendi. Vamos corrigir esse detalhe.',
          inputTokens: 10,
          outputTokens: 8,
        };
      },
    );
    const processor = createTurnProcessor(
      { execute: vi.fn(), executeStream: stream },
      history,
      createVoiceMetrics(),
      undefined,
      undefined,
      { analyze },
    );
    await processor.process(
      {
        sessionId: randomUUID(),
        conversationId: randomUUID(),
        ownerId: 'test',
        turnId: 1,
        responseId: randomUUID(),
        dataClass: 'synthetic',
        text: 'Não resolveu ainda.',
        profile: null,
        signal: new AbortController().signal,
        speechEndedAt: performance.now(),
      },
      { send: (event) => events.push(event), audio: async () => {} },
    );
    expect(analyze).toHaveBeenCalledOnce();
    expect(stream).toHaveBeenCalledTimes(recover ? 2 : 1);
    expect(events.filter((e) => e.type === 'reply.text')).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toContain('DIREÇÃO CONTEXTUAL');
  },
);
