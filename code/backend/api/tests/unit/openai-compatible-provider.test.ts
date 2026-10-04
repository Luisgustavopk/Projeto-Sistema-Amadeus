import { afterEach, expect, it, vi } from 'vitest';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

afterEach(() => vi.unstubAllGlobals());

it('usa Groq via endpoint oficial compatível e contabiliza tokens', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Olá!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({ GROQ_API_KEY: 'test-secret' })(
    'llm',
    ProviderSchema.parse({
      adapter: 'groq',
      model: 'openai/gpt-oss-20b',
      apiKeyEnv: 'GROQ_API_KEY',
    }),
  );

  await expect(
    provider.execute({
      content: 'teste',
      systemPrompt: 'Direção da persona',
      dataClass: 'synthetic',
      maxTokens: 128,
    }),
  ).resolves.toEqual({
    content: 'Olá!',
    inputTokens: 12,
    outputTokens: 4,
  });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://api.groq.com/openai/v1/chat/completions',
  );
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
    authorization: 'Bearer test-secret',
  });
  expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
    model: 'openai/gpt-oss-20b',
    messages: [
      { role: 'system', content: 'Direção da persona' },
      { role: 'user', content: 'teste' },
    ],
    max_tokens: 128,
    stream: false,
  });
});

it('usa Cloudflare Workers AI via endpoint da conta sem expor token na URL', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Resposta Cloudflare.' } }],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const accountId = 'c'.repeat(32);
  const provider = createProviderFactory({
    CLOUDFLARE_AI_TOKEN: 'test-secret',
  })(
    'llm',
    ProviderSchema.parse({
      adapter: 'cloudflare-ai',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
      accountId,
    }),
  );

  await expect(
    provider.execute({
      content: 'teste',
      dataClass: 'synthetic',
      maxTokens: 128,
    }),
  ).resolves.toEqual({
    content: 'Resposta Cloudflare.',
    inputTokens: null,
    outputTokens: null,
  });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
  );
  expect(String(fetch.mock.calls[0]?.[0])).not.toContain('test-secret');
});

it('faz streaming compatível com SSE e coleta uso final sem fragmento vazio', async () => {
  const events = [
    {
      choices: [{ delta: { content: 'Olá' }, finish_reason: null }],
    },
    {
      choices: [{ delta: { content: '!' }, finish_reason: 'stop' }],
    },
    {
      choices: [],
      usage: { prompt_tokens: 7, completion_tokens: 2 },
    },
  ];
  const body =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
    'data: [DONE]\n\n';
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body));
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({ GROQ_API_KEY: 'test-secret' })(
    'llm',
    ProviderSchema.parse({
      adapter: 'groq',
      model: 'test-model',
      apiKeyEnv: 'GROQ_API_KEY',
    }),
  );
  const chunks = [];

  for await (const chunk of provider.stream!({
    content: 'teste',
    dataClass: 'synthetic',
    maxTokens: 128,
  })) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual([
    { content: 'Olá', inputTokens: null, outputTokens: null },
    { content: '!', inputTokens: null, outputTokens: null },
    { content: '', inputTokens: 7, outputTokens: 2 },
  ]);
  expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string).stream).toBe(
    true,
  );
});

it.each([
  [429, 'QUOTA_EXCEEDED'],
  [503, 'PROVIDER_TEMPORARILY_UNAVAILABLE'],
  [401, 'PROVIDER_CONFIGURATION'],
])(
  'classifica status HTTP %s para habilitar ou recusar fallback correto',
  async (status, code) => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status }));
    const provider = createProviderFactory({ GROQ_API_KEY: 'test-secret' })(
      'llm',
      ProviderSchema.parse({
        adapter: 'groq',
        model: 'test-model',
        apiKeyEnv: 'GROQ_API_KEY',
      }),
    );
    await expect(
      provider.execute({
        content: 'teste',
        dataClass: 'synthetic',
        maxTokens: 64,
      }),
    ).rejects.toMatchObject({ code });
  },
);
