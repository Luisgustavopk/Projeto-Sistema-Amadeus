import { afterEach, expect, it, vi } from 'vitest';
import { createProviderFactory } from '../../src/adapters/providers/factory.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

afterEach(() => vi.unstubAllGlobals());

function audioInput() {
  return {
    content: '',
    audio: {
      pcmBase64: Buffer.alloc(3200).toString('base64'),
      sampleRate: 16000 as const,
      channels: 1 as const,
    },
    dataClass: 'personal' as const,
    maxTokens: 1000,
  };
}

it('envia WAV PCM16 mono de 16 kHz à Deepgram e interpreta a transcrição', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          results: {
            channels: [{ alternatives: [{ transcript: 'Olá, Amadeus.' }] }],
          },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);

  const provider = createProviderFactory({
    DEEPGRAM_API_KEY: 'test-secret',
  })(
    'stt',
    ProviderSchema.parse({
      adapter: 'deepgram',
      model: 'nova-3',
      apiKeyEnv: 'DEEPGRAM_API_KEY',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2025-01-01T00:00:00.000Z',
      policyReference: 'https://example.com/privacy',
    }),
  );

  await expect(provider.execute(audioInput())).resolves.toEqual({
    content: 'Olá, Amadeus.',
    inputTokens: null,
    outputTokens: null,
  });

  const [url, init] = fetch.mock.calls[0]!;
  expect(new URL(String(url)).searchParams.get('model')).toBe('nova-3');
  expect(new URL(String(url)).searchParams.get('language')).toBe('pt');
  expect(init?.headers).toMatchObject({
    Authorization: 'Token test-secret',
    'Content-Type': 'audio/wav',
  });
  const wav = Buffer.from(init?.body as Uint8Array);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  expect(wav.readUInt32LE(24)).toBe(16000);
});

it('preserva o resultado sem fala como NO_SPEECH_DETECTED', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          results: {
            channels: [{ alternatives: [{ transcript: '  ' }] }],
          },
        }),
      ),
  );
  const provider = createProviderFactory({
    DEEPGRAM_API_KEY: 'test-secret',
  })(
    'stt',
    ProviderSchema.parse({
      adapter: 'deepgram',
      model: 'nova-3',
      apiKeyEnv: 'DEEPGRAM_API_KEY',
    }),
  );

  await expect(provider.execute(audioInput())).rejects.toMatchObject({
    code: 'NO_SPEECH_DETECTED',
  });
});

it('rejeita áudio STT maior que o limite sem chamar a Deepgram', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({
    DEEPGRAM_API_KEY: 'test-secret',
  })(
    'stt',
    ProviderSchema.parse({
      adapter: 'deepgram',
      model: 'nova-3',
      apiKeyEnv: 'DEEPGRAM_API_KEY',
    }),
  );

  await expect(
    provider.execute({
      ...audioInput(),
      audio: {
        pcmBase64: Buffer.alloc(960002).toString('base64'),
        sampleRate: 16000 as const,
        channels: 1 as const,
      },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_INPUT' });
  expect(fetch).not.toHaveBeenCalled();
});

it('envia texto à voz Cartesia configurada e retorna PCM mono de 24 kHz', async () => {
  const pcm = Buffer.alloc(4800, 7);
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(pcm, { headers: { 'Content-Type': 'audio/raw' } }),
  );
  vi.stubGlobal('fetch', fetch);

  const provider = createProviderFactory({
    CARTESIA_API_KEY: 'test-secret',
  })(
    'tts',
    ProviderSchema.parse({
      adapter: 'cartesia',
      model: 'sonic-3.6',
      voiceId: '43df381e-ea60-4277-bd90-91ceb0c71007',
      apiKeyEnv: 'CARTESIA_API_KEY',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2025-01-01T00:00:00.000Z',
      policyReference: 'https://example.com/privacy',
    }),
  );

  await expect(
    provider.execute({
      content: 'Olá, mundo.',
      dataClass: 'personal',
      maxTokens: 220,
    }),
  ).resolves.toEqual({
    content: '',
    inputTokens: null,
    outputTokens: null,
    audio: {
      pcmBase64: pcm.toString('base64'),
      sampleRate: 24000,
      channels: 1,
    },
  });

  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe('https://api.cartesia.ai/tts/bytes');
  expect(init?.headers).toMatchObject({
    'X-API-Key': 'test-secret',
    'Cartesia-Version': '2026-08-14',
  });
  expect(JSON.parse(init?.body as string)).toMatchObject({
    model_id: 'sonic-3.6',
    transcript: 'Olá, mundo.',
    voice: { id: '43df381e-ea60-4277-bd90-91ceb0c71007' },
    language: 'pt',
    accent: 'brazilian-portuguese',
    output_format: {
      container: 'raw',
      encoding: 'pcm_s16le',
      sample_rate: 24000,
    },
  });
});

it('limita o tamanho do áudio retornado pela Cartesia', async () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response(Buffer.alloc(4 * 1024 * 1024 + 1)),
  );
  const provider = createProviderFactory({
    CARTESIA_API_KEY: 'test-secret',
  })(
    'tts',
    ProviderSchema.parse({
      adapter: 'cartesia',
      model: 'sonic-3.6',
      voiceId: '43df381e-ea60-4277-bd90-91ceb0c71007',
      apiKeyEnv: 'CARTESIA_API_KEY',
    }),
  );

  await expect(
    provider.execute({
      content: 'Olá.',
      dataClass: 'synthetic',
      maxTokens: 220,
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});

it('envia a expressão também na rota de áudio completo e a confirma após PCM válido', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(Buffer.alloc(4800)),
  );
  vi.stubGlobal('fetch', fetch);
  const provider = createProviderFactory({ CARTESIA_API_KEY: 'test-only-key' })(
    'tts',
    ProviderSchema.parse({
      adapter: 'cartesia',
      model: 'sonic-3.6',
      voiceId: '43df381e-ea60-4277-bd90-91ceb0c71007',
      apiKeyEnv: 'CARTESIA_API_KEY',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2025-01-01T00:00:00.000Z',
      policyReference: 'https://example.com/privacy',
    }),
  );
  const speechExpression = {
    intent: 'agradecer' as const,
    emotion: 'constrangimento' as const,
    intensity: 0.4,
  };
  const output = await provider.execute({
    content: 'Ah… obrigada.',
    dataClass: 'synthetic',
    maxTokens: 1,
    speechExpression,
  });
  expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
    generation_config: { emotion: 'hesitant' },
  });
  expect(output.speechExpressionApplied).toEqual(speechExpression);
  fetch.mockImplementation(async () => new Response(Buffer.alloc(3)));
  await expect(
    provider.execute({
      content: 'Obrigada.',
      dataClass: 'synthetic',
      maxTokens: 1,
      speechExpression,
    }),
  ).rejects.toThrow();
});

it.each([
  [401, 'PROVIDER_CONFIGURATION'],
  [429, 'QUOTA_EXCEEDED'],
  [503, 'PROVIDER_TEMPORARILY_UNAVAILABLE'],
])('classifica HTTP %i de provedor cloud como %s', async (status, code) => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status }));
  const provider = createProviderFactory({
    DEEPGRAM_API_KEY: 'test-secret',
  })(
    'stt',
    ProviderSchema.parse({
      adapter: 'deepgram',
      model: 'nova-3',
      apiKeyEnv: 'DEEPGRAM_API_KEY',
    }),
  );

  await expect(provider.execute(audioInput())).rejects.toMatchObject({
    code,
  });
});
