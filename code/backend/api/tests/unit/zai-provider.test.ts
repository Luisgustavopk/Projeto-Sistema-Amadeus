import { afterEach, expect, it, vi } from 'vitest';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

afterEach(() => vi.unstubAllGlobals());

function provider() {
  return createProviderFactory({
    ZAI_GLM_FLASH: 'synthetic-zai-key',
    GROQ_API_KEY: 'other-synthetic-key',
  })(
    'llm',
    ProviderSchema.parse({
      adapter: 'zai',
      model: 'glm-4.7-flash',
      apiKeyEnv: 'ZAI_GLM_FLASH',
    }),
  );
}

it('usa a chave Z.ai e JSON em memória sem tratar raciocínio como fatos', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"facts":[]}',
                reasoning_content: 'não é uma memória',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const service = provider();
  const output = await service.execute({
    content: 'Dados fictícios',
    purpose: 'memory',
    dataClass: 'synthetic',
    maxTokens: 4096,
  });
  expect(output).toMatchObject({
    content: '{"facts":[]}',
    inputTokens: 12,
    outputTokens: 4,
  });
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
  expect(request!.headers).toMatchObject({
    authorization: 'Bearer synthetic-zai-key',
  });
  expect(request!.redirect).toBe('error');
  expect(JSON.parse(request!.body as string)).toMatchObject({
    model: 'glm-4.7-flash',
    stream: false,
    temperature: 0,
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
  });
  await service.execute({
    content: 'Outra fala fictícia',
    dataClass: 'synthetic',
    maxTokens: 100,
  });
  const conversation = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
  expect(conversation.response_format).toBeUndefined();
  expect(conversation.thinking).toBeUndefined();
});

it.each(['glm-4.7-flashx', 'glm-5.3-flash', 'glm-5.3'])(
  'recusa o modelo pago %s antes de enviar',
  (model) => {
    expect(() =>
      ProviderSchema.parse({
        adapter: 'zai',
        model,
        apiKeyEnv: 'ZAI_GLM_FLASH',
      }),
    ).toThrow();
  },
);

it('recusa endpoint alternativo, chave ausente e uso como serviço de fala', () => {
  expect(() =>
    ProviderSchema.parse({
      adapter: 'zai',
      model: 'glm-4.7-flash',
      apiKeyEnv: 'ZAI_GLM_FLASH',
      endpoint: 'https://example.invalid/chat/completions',
    }),
  ).toThrow();
  const config = ProviderSchema.parse({
    adapter: 'zai',
    model: 'glm-4.7-flash',
    apiKeyEnv: 'ZAI_GLM_FLASH',
  });
  expect(() =>
    createProviderFactory({ GROQ_API_KEY: 'other-synthetic-key' })(
      'llm',
      config,
    ),
  ).toThrow();
  expect(() =>
    createProviderFactory({ ZAI_GLM_FLASH: 'synthetic-zai-key' })(
      'stt',
      config,
    ),
  ).toThrow();
});

it.each([
  ['1113', 'PROVIDER_CONFIGURATION'],
  ['1315', 'PROVIDER_CONFIGURATION'],
  ['1305', 'PROVIDER_TEMPORARILY_UNAVAILABLE'],
  ['1302', 'QUOTA_EXCEEDED'],
  ['1308', 'QUOTA_EXCEEDED'],
])(
  'distingue a recusa %s sem revelar a mensagem remota',
  async (code, expectedCode) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code, message: 'conteúdo privado do fornecedor' },
            }),
            { status: 429 },
          ),
      ),
    );
    const error = await provider()
      .execute({
        content: 'Dados fictícios',
        purpose: 'memory',
        dataClass: 'synthetic',
        maxTokens: 100,
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: expectedCode,
      message: expect.stringContaining(code),
    });
    expect((error as Error).message).not.toContain('conteúdo privado');
  },
);
