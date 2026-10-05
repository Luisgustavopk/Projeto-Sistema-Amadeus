import { afterEach, expect, it, vi } from 'vitest';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import {
  ProviderSchema,
  ProvidersSchema,
} from '../../src/domain/providers/model.ts';
import { createProviderCooldowns } from '../../src/application/providers/cooldowns.ts';
import { selectProviderAttempts } from '../../src/application/providers/routing.ts';
import { QuotaExceededError } from '../../src/domain/errors/providers.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { SqliteProviderUsageRepository } from '../../src/adapters/database/provider-usage-repository.ts';

afterEach(() => vi.unstubAllGlobals());
const input = {
  content: 'Teste fictício.',
  dataClass: 'synthetic' as const,
  maxTokens: 64,
};
const config = (model = 'qwen/qwen3.8-27b:free') =>
  ProviderSchema.parse({
    adapter: 'openrouter',
    model,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    limits: { requestsPerDay: 1, tokensPerDay: 1000 },
  });

it('classifica falta de endpoint gratuito e erro de cota dentro do SSE', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    .mockResolvedValueOnce(
      new Response('data: {"error":{"code":429,"message":"segredo"}}\n\n'),
    );
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({ OPENROUTER_API_KEY: 'fake-secret' })(
    'llm',
    config(),
  );
  await expect(provider.execute(input)).rejects.toMatchObject({
    code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });
  await expect(
    (async () => {
      for await (const chunk of provider.stream!(input)) {
        void chunk;
      }
    })(),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
});

it.each([
  [
    'mistral',
    'mistral-small-latest',
    'https://api.mistral.ai/v1/chat/completions',
  ],
  [
    'openrouter',
    'qwen/qwen3.8-27b:free',
    'https://openrouter.ai/api/v1/chat/completions',
  ],
])(
  'executa %s e preserva o prompt da persona',
  async (adapter, model, endpoint) => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Olá.' } }],
            usage: { prompt_tokens: 8, completion_tokens: 3 },
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const provider = createProviderFactory({ TEST_KEY: 'fake-secret' })(
      'llm',
      ProviderSchema.parse({ adapter, model, apiKeyEnv: 'TEST_KEY' }),
    );
    expect(
      await provider.execute({ ...input, systemPrompt: 'Persona Kurisu' }),
    ).toMatchObject({ content: 'Olá.', inputTokens: 8 });
    expect(fetch.mock.calls[0]?.[0]).toBe(endpoint);
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'Persona Kurisu',
    });

    if (adapter === 'openrouter') {
      expect(body.provider).toMatchObject({
        max_price: { prompt: 0, completion: 0 },
        data_collection: 'deny',
      });
      expect(body.reasoning).toEqual({ enabled: false, exclude: true });
    }
  },
);

it.each(['openrouter/free', 'openrouter/auto', 'qwen/qwen3.8-27b'])(
  'recusa rota aleatória ou paga %s',
  (model) => {
    expect(
      ProviderSchema.safeParse({
        adapter: 'openrouter',
        model,
        apiKeyEnv: 'TEST_KEY',
      }).success,
    ).toBe(false);
  },
);

it('respeita Retry-After e compartilha pausa de cota entre modelos OpenRouter', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response('conteúdo privado', {
        status: 429,
        headers: { 'retry-after': '120', 'x-ratelimit-limit': '50' },
      }),
  );
  const provider = createProviderFactory({ OPENROUTER_API_KEY: 'fake-secret' })(
    'llm',
    config(),
  );
  let failure: unknown;

  try {
    await provider.execute(input);
  } catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({
    code: 'QUOTA_EXCEEDED',
    retryAfterMs: 120000,
  });
  let now = 0;
  const cooldowns = createProviderCooldowns(() => now);
  cooldowns.record(config(), failure);
  expect(cooldowns.blocked(config('nvidia/nemotron-3.5-lightning:free'))).toBe(
    failure,
  );
  now = 120000;
  expect(cooldowns.blocked(config())).toBeUndefined();
});

it('não pausa os outros modelos quando o endpoint retorna 429 sem limite global', async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 429 }));
  const provider = createProviderFactory({ OPENROUTER_API_KEY: 'fake-secret' })(
    'llm',
    config(),
  );
  let failure: unknown;

  try {
    await provider.execute(input);
  } catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({
    code: 'QUOTA_EXCEEDED',
    quotaScope: 'model',
  });
  const cooldowns = createProviderCooldowns(() => 0);
  cooldowns.record(config(), failure);
  expect(cooldowns.blocked(config())).toBe(failure);
  expect(
    cooldowns.blocked(config('nvidia/nemotron-3.5-lightning:free')),
  ).toBeUndefined();
});

it('contabiliza a cota gratuita em conjunto no banco entre modelos', async () => {
  const database = await openDatabase('file::memory:');

  try {
    const usage = new SqliteProviderUsageRepository(database.client);
    const id = await usage.reserve('primary', 'llm', config(), 64);
    await usage.settle(id, null);
    await expect(
      usage.reserve(
        'primary',
        'llm',
        config('nvidia/nemotron-3.5-lightning:free'),
        64,
      ),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(
      (
        await usage.usage(
          'primary',
          'llm',
          config('nvidia/nemotron-3.5-lightning:free'),
        )
      ).requests,
    ).toBe(1);
  } finally {
    database.client.close();
  }
});

it('usa o local por último em cloud-first e mantém local-only sem nuvem', () => {
  const providers = ProvidersSchema.parse({
    llm: {
      ...config(),
      localRouting: 'cloud-first',
      localProvider: {
        adapter: 'openai-local',
        endpoint: 'http://127.0.0.1:8003/v1/chat/completions',
        model: 'amadeus-local',
        dataPolicy: 'local-approved',
      },
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });
  expect(
    selectProviderAttempts('llm', providers.llm, input).map((p) => p.adapter),
  ).toEqual(['openrouter', 'openai-local']);
  expect(
    selectProviderAttempts('llm', providers.llm, {
      ...input,
      dataClass: 'local-only',
    }).map((p) => p.adapter),
  ).toEqual(['openai-local']);
});
