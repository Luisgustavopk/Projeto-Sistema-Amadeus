import { afterEach, expect, it, vi } from 'vitest';
import {
  ProviderSchema,
  ProvidersSchema,
} from '../../src/domain/providers/model.ts';
import { LLAMA_REFINEMENT_MODEL } from '../../src/domain/providers/openrouter.ts';
import { buildLlamaRefinement } from '../../src/application/providers/llama-refinement.ts';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import { createProviderServices } from '../../src/application/providers/index.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { SqliteProviderUsageRepository } from '../../src/adapters/database/provider-usage-repository.ts';
import { providerKey } from '../../src/adapters/database/keys.ts';
import { createProviderCooldowns } from '../../src/application/providers/cooldowns.ts';
import { QuotaExceededError } from '../../src/domain/errors/providers.ts';
import { MemoryExtractorProviderSchema } from '../../src/domain/memory/extractor.ts';

afterEach(() => vi.unstubAllGlobals());
const paid = () =>
  ProviderSchema.parse({
    adapter: 'openrouter',
    model: LLAMA_REFINEMENT_MODEL,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    openRouterPaid: { maxPromptPrice: 0.15, maxCompletionPrice: 0.4 },
    limits: { requestsPerDay: 1, tokensPerDay: 10000 },
  });
const free = () =>
  ProviderSchema.parse({
    adapter: 'openrouter',
    model: 'qwen/qwen3.8-27b:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    limits: { requestsPerDay: 2, tokensPerDay: 10000 },
  });
const input = {
  content: 'Pergunta fictícia',
  dataClass: 'synthetic' as const,
  maxTokens: 32,
};

it('não confunde cota gratuita com falta de crédito pago nos cooldowns', () => {
  const cooldowns = createProviderCooldowns(() => 0);
  const failure = new QuotaExceededError();
  failure.quotaScope = 'free';
  cooldowns.record(free(), failure);
  expect(cooldowns.blocked(free())).toBe(failure);
  expect(cooldowns.blocked(paid())).toBeUndefined();
  const paidFailure = new QuotaExceededError();
  paidFailure.quotaScope = 'paid';
  cooldowns.record(paid(), paidFailure);
  expect(cooldowns.blocked(paid())).toBe(paidFailure);
});

it('autoriza somente Llama explícito dentro do teto e mantém reservas gratuitas', () => {
  expect(
    ProviderSchema.safeParse({ ...paid(), openRouterPaid: undefined }).success,
  ).toBe(false);
  expect(
    ProviderSchema.safeParse({ ...paid(), model: 'openrouter/auto' }).success,
  ).toBe(false);
  expect(
    ProviderSchema.safeParse({
      ...paid(),
      openRouterPaid: { maxPromptPrice: 0.16, maxCompletionPrice: 0.4 },
    }).success,
  ).toBe(false);
  expect(ProviderSchema.safeParse({ ...paid(), adapter: 'groq' }).success).toBe(
    false,
  );
  expect(MemoryExtractorProviderSchema.safeParse(paid()).success).toBe(false);
  expect(
    ProvidersSchema.safeParse({
      llm: { ...paid(), fallbackProviders: [paid()] },
      stt: { adapter: 'disabled' },
      tts: { adapter: 'disabled' },
    }).success,
  ).toBe(false);
});

it('preserva áudio, políticas e cotas das reservas e prioriza Llama inclusive em perguntas casuais', () => {
  const previous = ProvidersSchema.parse({
    llm: {
      adapter: 'groq',
      model: 'qwen/qwen3.8-27b',
      apiKeyEnv: 'GROQ_API_KEY',
      limits: { requestsPerDay: 50, tokensPerDay: 200000 },
      fallbackProviders: [free()],
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });
  const next = buildLlamaRefinement(previous);
  expect(next.stt).toEqual(previous.stt);
  expect(next.tts).toEqual(previous.tts);
  expect(next.llm.model).toBe(LLAMA_REFINEMENT_MODEL);
  expect(next.llm.fallbackProviders?.map((p) => p.model)).toEqual([
    'qwen/qwen3.8-27b',
    'qwen/qwen3.8-27b:free',
  ]);
  expect(next.llm.fallbackProviders?.[0]?.limits).toEqual(previous.llm.limits);
  expect(buildLlamaRefinement(next).llm.fallbackProviders).toEqual(
    next.llm.fallbackProviders,
  );
});

it.each([false, true])(
  'usa os tetos corretos em chamadas pagas=%s com a mesma chave',
  async (isPaid) => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Olá.' } }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    await createProviderFactory({ OPENROUTER_API_KEY: 'ficticia' })(
      'llm',
      isPaid ? paid() : free(),
    ).execute(input);
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.provider).toMatchObject({
      data_collection: 'deny',
      max_price: {
        prompt: isPaid ? 0.15 : 0,
        completion: isPaid ? 0.4 : 0,
        request: 0,
      },
    });

    if (isPaid) {
      expect(body.temperature).toBe(0.6);
      expect(body.provider).toMatchObject({
        preferred_min_throughput: { p50: 40 },
        preferred_max_latency: { p50: 2 },
      });
    } else {
      expect(body.temperature).toBeUndefined();
      expect(body.provider.preferred_min_throughput).toBeUndefined();
    }

    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({
      authorization: 'Bearer ficticia',
    });
    expect(providerKey('llm', paid())).not.toBe(providerKey('llm', free()));
  },
);

it.each([false, true])(
  'recupera 402 em streaming=%s, tenta reserva na mesma chave e separa cotas persistidas',
  async (stream) => {
    const database = await openDatabase('file::memory:');

    try {
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const body = JSON.parse(init!.body as string);

        if (body.model === LLAMA_REFINEMENT_MODEL) {
          return new Response('{}', { status: 402 });
        }

        return stream
          ? new Response(
              'data: {"choices":[{"delta":{"content":"Resposta reserva."}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":3}}\n\ndata: [DONE]\n\n',
            )
          : new Response(
              JSON.stringify({
                choices: [{ message: { content: 'Resposta reserva.' } }],
                usage: { prompt_tokens: 4, completion_tokens: 3 },
              }),
            );
      });
      vi.stubGlobal('fetch', fetch);
      const config = ProvidersSchema.parse({
        llm: { ...paid(), fallbackProviders: [free()] },
        stt: { adapter: 'disabled' },
        tts: { adapter: 'disabled' },
      });
      const usage = new SqliteProviderUsageRepository(database.client);
      const onFallback = vi.fn();
      const services = createProviderServices({
        configuration: { get: async () => config, save: async () => {} },
        usage,
        ownerId: 'test',
        factory: createProviderFactory({ OPENROUTER_API_KEY: 'ficticia' }),
        gate: {
          beginExecution: () => () => {},
          beginConfiguration: () => () => {},
        },
        onFallback,
      });

      const execute = async () => {
        if (!stream) {
          return (await services.execute('llm', input)).content;
        }

        let result = '';

        for await (const chunk of services.executeStream(input)) {
          result += chunk.content;
        }

        return result;
      };

      expect(await execute()).toBe('Resposta reserva.');
      expect(await execute()).toBe('Resposta reserva.');
      expect(fetch).toHaveBeenCalledTimes(3);
      expect((await usage.usage('test', 'llm', paid())).requests).toBe(1);
      expect((await usage.usage('test', 'llm', free())).requests).toBe(2);
      expect(onFallback.mock.calls[0]![0]).toMatchObject({
        fromModel: LLAMA_REFINEMENT_MODEL,
        toModel: free().model,
        reason: 'QUOTA_EXCEEDED',
      });
    } finally {
      database.client.close();
    }
  },
);
