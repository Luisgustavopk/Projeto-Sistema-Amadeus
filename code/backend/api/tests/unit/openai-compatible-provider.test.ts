import { afterEach, expect, it, vi } from 'vitest';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';
import { MEMORY_OUTPUT_FORMAT } from '../../src/domain/memory/output.ts';

afterEach(() => vi.unstubAllGlobals());

it('pede JSON em extrações de memória na Groq sem alterar respostas da conversa', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"facts":[]}' }, finish_reason: 'stop' },
          ],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({
    GROQ_API_KEY: 'synthetic-test-key',
  })(
    'llm',
    ProviderSchema.parse({
      adapter: 'groq',
      model: 'openai/gpt-oss-20b',
      apiKeyEnv: 'GROQ_API_KEY',
    }),
  );
  await provider.execute({
    content: 'Dados fictícios',
    dataClass: 'synthetic',
    purpose: 'memory',
    maxTokens: 100,
  });
  await provider.execute({
    content: 'Conversa fictícia',
    dataClass: 'synthetic',
    maxTokens: 100,
  });
  expect(
    JSON.parse(fetch.mock.calls[0]![1]!.body as string).response_format,
  ).toEqual(MEMORY_OUTPUT_FORMAT);
  expect(
    JSON.parse(fetch.mock.calls[1]![1]!.body as string).response_format,
  ).toBeUndefined();
});

it('preserva fragmentos numéricos do Workers AI sem sintetizar metadados', async () => {
  const events = [
    { choices: [{ delta: { content: 'Uma hipótese em ' } }] },
    { choices: [{ delta: { content: 10 } }] },
    { choices: [{ delta: { content: ' segundos.' } }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    },
  ];
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') +
          'data: [DONE]\n\n',
      ),
  );
  const provider = createProviderFactory({
    CLOUDFLARE_AI_TOKEN: 'test-secret',
  })(
    'llm',
    ProviderSchema.parse({
      adapter: 'cloudflare-ai',
      model: 'test-model',
      apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
      accountId: 'c'.repeat(32),
    }),
  );
  const chunks = [];

  for await (const chunk of provider.stream!({
    content: 'teste',
    dataClass: 'synthetic',
    maxTokens: 64,
  })) {
    chunks.push(chunk);
  }

  expect(chunks.map((c) => c.content).join('')).toBe(
    'Uma hipótese em 10 segundos.',
  );
  expect(chunks.at(-1)).toMatchObject({
    content: '',
    inputTokens: 12,
    outputTokens: 4,
  });
});

it('desabilita raciocínio do Qwen para não sintetizar o bloco interno como fala', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'Teste concluído.' }, finish_reason: 'stop' },
          ],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({ GROQ_API_KEY: 'test-secret' })(
    'llm',
    ProviderSchema.parse({
      adapter: 'groq',
      model: 'qwen/qwen3.8-27b',
      apiKeyEnv: 'GROQ_API_KEY',
    }),
  );
  await provider.execute({
    content: 'teste',
    dataClass: 'synthetic',
    maxTokens: 128,
  });
  const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
  expect(body).toMatchObject({
    reasoning_effort: 'none',
    include_reasoning: false,
  });
  expect(body.reasoning_format).toBeUndefined();
});

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
    reasoning_effort: 'low',
    include_reasoning: false,
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
  [413, 'PROVIDER_CONFIGURATION'],
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

it.each(['execute', 'stream'] as const)(
  'classifica o 413 de tokens do Groq como cota em %s, sem expor a mensagem remota',
  async (mode) => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'rate_limit_exceeded',
              type: 'tokens',
              message: 'private remote detail',
            },
          }),
          { status: 413 },
        ),
    );
    const provider = createProviderFactory({ GROQ_API_KEY: 'test-secret' })(
      'llm',
      ProviderSchema.parse({
        adapter: 'groq',
        model: 'test-model',
        apiKeyEnv: 'GROQ_API_KEY',
      }),
    );
    const input = {
      content: 'teste',
      dataClass: 'synthetic' as const,
      maxTokens: 64,
    };

    const run = async () => {
      if (mode === 'execute') {
        return provider.execute(input);
      }

      for await (const chunk of provider.stream!(input)) {
        void chunk;
      }
    };

    await expect(run()).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    await expect(run()).rejects.not.toThrow('private remote detail');
  },
);

it.each([
  'not-json',
  'x'.repeat(8193),
  JSON.stringify({ error: { code: 'request_too_large' } }),
])(
  'não transforma um 413 sem identificação de limite de tokens em cota',
  async (body) => {
    vi.stubGlobal('fetch', async () => new Response(body, { status: 413 }));
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
    ).rejects.toMatchObject({ code: 'PROVIDER_CONFIGURATION' });
  },
);
