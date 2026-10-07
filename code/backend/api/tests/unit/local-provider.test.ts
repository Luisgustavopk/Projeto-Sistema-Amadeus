import { afterEach, expect, it, vi } from 'vitest';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import {
  ProviderSchema,
  ProvidersSchema,
  DEFAULT_PROVIDERS,
} from '../../src/domain/providers/model.ts';

afterEach(() => vi.unstubAllGlobals());

it('não envia contexto Cartesia ao contrato HTTP de fala', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const input = JSON.parse(String(init?.body));

    if ('speechContextId' in input) {
      return new Response('{}', { status: 422 });
    }

    expect(input.voice).toMatchObject({ referenceFile: 'reference.wav' });

    return new Response(
      JSON.stringify({
        content: '',
        inputTokens: null,
        outputTokens: null,
        audio: {
          pcmBase64: Buffer.alloc(4800).toString('base64'),
          sampleRate: 24000,
          channels: 1,
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({ LOCAL_TTS_API_KEY: 'test-key' })(
    'tts',
    ProviderSchema.parse({
      adapter: 'http-json',
      endpoint: 'http://127.0.0.1:8002',
      apiKeyEnv: 'LOCAL_TTS_API_KEY',
      dataPolicy: 'local-approved',
    }),
  );
  await expect(
    provider.execute({
      content: 'Olá.',
      dataClass: 'synthetic',
      maxTokens: 1,
      speechContextId: 'stream-context',
      voice: {
        id: '43df381e-ea60-4277-bd90-91ceb0c71007',
        referenceFile: 'reference.wav',
        referenceSha256: 'a'.repeat(64),
      },
    }),
  ).resolves.toMatchObject({ audio: { sampleRate: 24000 } });
});

const local = {
  adapter: 'openai-local',
  endpoint: 'http://127.0.0.1:8003/v1/chat/completions',
  model: 'amadeus-local',
  dataPolicy: 'local-approved',
  apiKeyEnv: 'LOCAL_LLM_API_KEY',
};

it.each([
  'https://remote.example/v1/chat/completions',
  'http://127.0.0.1.evil.test/v1/chat/completions',
  'http://127.0.0.1:8003/v1/chat/completions?key=secret',
  'http://user:password@localhost/v1/chat/completions',
  'http://localhost/execute',
])('recusa endpoint local inseguro: %s', (endpoint) => {
  expect(ProviderSchema.safeParse({ ...local, endpoint }).success).toBe(false);
});

it('preserva as mensagens de sistema e usa somente a credencial local', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Oi.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({
    LOCAL_LLM_API_KEY: 'local-test-key',
    GROQ_API_KEY: 'cloud-key',
  })('llm', ProviderSchema.parse(local));
  await expect(
    provider.execute({
      content: 'Oi',
      systemPrompt: 'Persona',
      dataClass: 'personal',
      maxTokens: 64,
    }),
  ).resolves.toMatchObject({ content: 'Oi.', inputTokens: 4 });
  expect(fetch.mock.calls[0]?.[0]).toBe(local.endpoint);
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
    authorization: 'Bearer local-test-key',
  });
  expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string).messages).toEqual(
    [
      { role: 'system', content: 'Persona' },
      { role: 'user', content: 'Oi' },
    ],
  );
});

it('recusa usar uma LLM como serviço de transcrição', () => {
  expect(
    ProvidersSchema.safeParse({ ...DEFAULT_PROVIDERS, stt: local }).success,
  ).toBe(false);
  expect(() =>
    createProviderFactory({ LOCAL_LLM_API_KEY: 'local-test-key' })(
      'stt',
      ProviderSchema.parse(local),
    ),
  ).toThrow();
});

it('desativa redirecionamentos e informa falhas de rede', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    throw new Error('blocked redirect');
  });
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({
    LOCAL_LLM_API_KEY: 'local-test-key',
  })('llm', ProviderSchema.parse(local));
  await expect(
    provider.execute({ content: 'Oi', dataClass: 'personal', maxTokens: 64 }),
  ).rejects.toThrow();
  expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('error');
});
