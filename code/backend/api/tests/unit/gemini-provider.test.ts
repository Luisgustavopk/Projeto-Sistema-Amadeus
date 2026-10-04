import type { ProviderOutput } from '../../src/ports/provider.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { createGeminiProvider } from '../../src/adapters/providers/gemini.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

afterEach(() => vi.unstubAllGlobals());
const config = ProviderSchema.parse({
  adapter: 'gemini',
  model: 'gemini-3.8-flash',
  apiKeyEnv: 'GEMINI_API_KEY',
});
it('envia a chave somente ao endpoint oficial e extrai texto e uso', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Olá' }] } }],
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createGeminiProvider(config, {
    GEMINI_API_KEY: 'test-secret',
  });
  expect(
    await provider.execute({
      content: 'teste',
      systemPrompt: 'Direção da persona',
      dataClass: 'synthetic',
      maxTokens: 512,
    }),
  ).toEqual({ content: 'Olá', inputTokens: 8, outputTokens: 2 });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  );
  expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
    systemInstruction: { parts: [{ text: 'Direção da persona' }] },
    contents: [{ role: 'user', parts: [{ text: 'teste' }] }],
  });
});
it('classifica cota remota e não inicia alternativas automáticas', async () => {
  const fetch = vi.fn(async () => new Response('{}', { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  await expect(
    createGeminiProvider(config, { GEMINI_API_KEY: 'test-secret' }).execute({
      content: 'teste',
      dataClass: 'synthetic',
      maxTokens: 512,
    }),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(fetch).toHaveBeenCalledOnce();
});
it('não anuncia resposta quando o provedor bloqueia ou retorna vazio', async () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ candidates: [] })),
  );
  await expect(
    createGeminiProvider(config, { GEMINI_API_KEY: 'test-secret' }).execute({
      content: 'teste',
      dataClass: 'synthetic',
      maxTokens: 512,
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});
it('exige chave, modelo e configuração local sem endpoint arbitrário', () => {
  expect(() => createGeminiProvider(config, {})).toThrow();
  expect(
    ProviderSchema.safeParse({ ...config, endpoint: 'https://example.com' })
      .success,
  ).toBe(false);
  expect(ProviderSchema.safeParse({ adapter: 'gemini' }).success).toBe(false);
});

it('decodifica SSE fragmentado e exclui pensamentos da fala', async () => {
  const chunks = [
    {
      candidates: [
        {
          content: {
            parts: [{ text: 'raciocínio', thought: true }, { text: 'Olá. ' }],
          },
        },
      ],
    },
    {
      candidates: [{ content: { parts: [{ text: 'Como vai?' }] } }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 3,
        totalTokenCount: 18,
      },
    },
  ];
  const encoded = new TextEncoder().encode(
    chunks
      .map((chunk) => 'data: ' + JSON.stringify(chunk) + '\r\n\r\n')
      .join(''),
  );
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoded.slice(0, 13));
            controller.enqueue(encoded.slice(13, 33));
            controller.enqueue(encoded.slice(33));
            controller.close();
          },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const output = [];

  for await (const chunk of createGeminiProvider(config, {
    GEMINI_API_KEY: 'test-secret',
  }).stream!({ content: 'teste', dataClass: 'synthetic', maxTokens: 512 })) {
    output.push(chunk);
  }

  expect(output.map((chunk) => chunk.content).join('')).toBe('Olá. Como vai?');
  expect(output.at(-1)?.outputTokens).toBe(8);
  expect(fetch.mock.calls[0]?.[0]).toContain(':streamGenerateContent?alt=sse');
});

it('preserva indisponibilidade temporária 503 tanto no streaming quanto na geração simples', async () => {
  const fetch = vi.fn(async () => new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const provider = createGeminiProvider(config, {
    GEMINI_API_KEY: 'test-secret',
  });
  const input = {
    content: 'teste',
    dataClass: 'synthetic' as const,
    maxTokens: 512,
  };
  await expect(provider.execute(input)).rejects.toMatchObject({
    code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });
  await expect(
    (async () => {
      for await (const chunk of provider.stream!(input)) {
        void chunk;
      }
    })(),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('envia nível baixo de raciocínio configurado sem alterar o limite de tokens', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Olá.' }] } }],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createGeminiProvider(
    { ...config, thinkingLevel: 'low' },
    { GEMINI_API_KEY: 'test-secret' },
  );
  await provider.execute({
    content: 'teste',
    dataClass: 'synthetic',
    maxTokens: 512,
  });
  const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  expect(body.generationConfig).toEqual({
    maxOutputTokens: 512,
    thinkingConfig: { thinkingLevel: 'low' },
  });
});

it('não entrega fragmento final truncado como resposta completa', async () => {
  const truncated = {
    candidates: [
      {
        finishReason: 'MAX_TOKENS',
        content: { parts: [{ text: 'Falta só a vinheta anim' }] },
      },
    ],
  };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(truncated)));
  const provider = createGeminiProvider(config, {
    GEMINI_API_KEY: 'test-secret',
  });
  await expect(
    provider.execute({
      content: 'teste',
      dataClass: 'synthetic',
      maxTokens: 512,
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
  vi.stubGlobal(
    'fetch',
    async () => new Response('data: ' + JSON.stringify(truncated) + '\n\n'),
  );
  const chunks: ProviderOutput[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider.stream!({
        content: 'teste',
        dataClass: 'synthetic',
        maxTokens: 512,
      })) {
        chunks.push(chunk);
      }
    })(),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
  expect(chunks).toEqual([]);
});
