import { expect, it, vi, afterEach } from 'vitest';
import { createProvider } from '../../src/adapters/providers/http-json.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

afterEach(() => vi.unstubAllGlobals());
it('não confunde silêncio validado pelo STT com indisponibilidade', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ code: 'NO_SPEECH_DETECTED' }), {
        status: 422,
      }),
  );
  const p = createProvider(
    'stt',
    ProviderSchema.parse({
      adapter: 'http-json',
      endpoint: 'http://127.0.0.1:8001',
      dataPolicy: 'local-approved',
    }),
    {},
  );
  await expect(
    p.execute({
      content: '',
      dataClass: 'synthetic',
      maxTokens: 1000,
      audio: {
        pcmBase64: Buffer.alloc(6400).toString('base64'),
        sampleRate: 16000,
        channels: 1,
      },
    }),
  ).rejects.toMatchObject({ code: 'NO_SPEECH_DETECTED' });
});
it('erro 422 de validação diferente de silêncio não é ignorado', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ code: 'INVALID_INPUT' }), { status: 422 }),
  );
  const p = createProvider(
    'stt',
    ProviderSchema.parse({
      adapter: 'http-json',
      endpoint: 'http://127.0.0.1:8001',
      dataPolicy: 'local-approved',
    }),
    {},
  );
  await expect(
    p.execute({ content: '', dataClass: 'synthetic', maxTokens: 1000 }),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});

it.each([
  [429, 'PROVIDER_BUSY'],
  [400, 'INVALID_PROVIDER_INPUT'],
])(
  'classifica status local %s sem anunciar indisponibilidade',
  async (status, code) => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status }));
    const p = createProvider(
      'stt',
      ProviderSchema.parse({
        adapter: 'http-json',
        endpoint: 'http://127.0.0.1:8001',
        dataPolicy: 'local-approved',
      }),
      {},
    );
    await expect(
      p.execute({ content: '', dataClass: 'synthetic', maxTokens: 1000 }),
    ).rejects.toMatchObject({ code });
  },
);
