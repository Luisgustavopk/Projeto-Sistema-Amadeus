import { expect, it, vi } from 'vitest';
import {
  ProvidersSchema,
  ProviderSchema,
} from '../../src/domain/providers/model.ts';
import {
  providerAttempts,
  filterProviderAttemptsForDataClass,
  type ProviderFallbackNotice,
} from '../../src/application/providers/fallback.ts';
import {
  ProviderTemporarilyUnavailableError,
  ProviderUnavailableError,
  QuotaExceededError,
} from '../../src/domain/errors/providers.ts';
import { createProviderServices } from '../../src/application/providers/index.ts';
import type {
  Provider,
  ProviderFactory,
  ProviderOutput,
} from '../../src/ports/provider.ts';

const output = { content: 'Teste concluído.', inputTokens: 4, outputTokens: 3 };
const input = {
  content: 'Frase fictícia.',
  dataClass: 'synthetic' as const,
  maxTokens: 512,
};

function setup(
  primary: NonNullable<Provider['stream']>,
  options: {
    fallback?: boolean;
    executeError?: Error;
    settlementError?: boolean;
  } = {},
) {
  const config = ProvidersSchema.parse({
    llm: {
      adapter: 'gemini',
      model: 'gemini-3.8-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      ...(options.fallback === false
        ? {}
        : { fallbackModel: 'gemini-3.6-flash' }),
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });
  const reserve = vi.fn(
    async (_owner, _role, config) => config.model as string,
  );
  const settle = vi.fn(async (_id, _outcome) => {
    if (options.settlementError && _outcome) {
      throw new ProviderTemporarilyUnavailableError();
    }
  });
  const factory = vi.fn((_role, config) => ({
    role: 'llm' as const,
    transport: 'sse' as const,
    nativeStreaming: true,
    health: async () => ({
      available: true,
      capabilities: {
        incrementalGeneration: true,
        progressiveDelivery: true,
        vision: false,
        customVoice: false,
        testedVoiceControls: [],
      },
    }),
    execute: async () => {
      if (config.model === 'gemini-3.8-flash' && options.executeError) {
        throw options.executeError;
      }

      return output;
    },
    stream:
      config.model === 'gemini-3.8-flash'
        ? primary
        : async function* () {
            yield output;
          },
  }));
  const release = vi.fn();
  const notify = vi.fn();
  const services = createProviderServices({
    configuration: { get: async () => config, save: async () => {} },
    usage: { reserve, settle, usage: vi.fn() },
    ownerId: 'primary',
    factory,
    gate: { beginConfiguration: () => release, beginExecution: () => release },
    onFallback: notify,
  });

  return { services, reserve, settle, factory, release, notify };
}

async function collect(source: AsyncIterable<ProviderOutput>) {
  const chunks = [];

  for await (const chunk of source) {
    chunks.push(chunk);
  }

  return chunks;
}

const temporaryFailure = async function* (): AsyncIterable<ProviderOutput> {
  yield await Promise.reject(new ProviderTemporarilyUnavailableError());
};

it('usa reserva após 503 antes de qualquer chunk e contabiliza cada modelo', async () => {
  const test = setup(temporaryFailure);
  expect(await collect(test.services.executeStream(input))).toEqual([output]);
  expect(test.reserve.mock.calls.map((call) => call[2].model)).toEqual([
    'gemini-3.8-flash',
    'gemini-3.6-flash',
  ]);
  expect(test.settle.mock.calls).toEqual([
    ['gemini-3.8-flash', null],
    ['gemini-3.6-flash', output],
  ]);
  expect(test.notify).toHaveBeenCalledWith({
    fromProvider: 'gemini',
    fromModel: 'gemini-3.8-flash',
    toProvider: 'gemini',
    toModel: 'gemini-3.6-flash',
    reason: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });
  expect(test.release).toHaveBeenCalledOnce();
});

it('aguarda o aviso da chamada antes de iniciar a reserva e conserva o callback global', async () => {
  const test = setup(temporaryFailure);
  const order: string[] = [];
  const result = await collect(
    test.services.executeStream(input, undefined, {
      onFallback: async (notice) => {
        expect(notice.reason).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE');
        expect(test.factory).toHaveBeenCalledOnce();
        await Promise.resolve();
        order.push('wait-delivered');
      },
    }),
  );
  expect(result).toEqual([output]);
  expect(order).toEqual(['wait-delivered']);
  expect(test.notify).toHaveBeenCalledOnce();
});

it('não inicia a reserva se o turno for interrompido durante o aviso', async () => {
  const test = setup(temporaryFailure);
  const abort = new AbortController();
  await expect(
    collect(
      test.services.executeStream(input, abort.signal, {
        onFallback: async () => {
          abort.abort();
        },
      }),
    ),
  ).rejects.toBeDefined();
  expect(test.factory).toHaveBeenCalledOnce();
});
it('também usa reserva na execução sem streaming', async () => {
  const test = setup(temporaryFailure, {
    executeError: new ProviderTemporarilyUnavailableError(),
  });
  expect(await test.services.execute('llm', input)).toEqual(output);
  expect(test.factory).toHaveBeenCalledTimes(2);
  expect(test.release).toHaveBeenCalledOnce();
});
it('usa o modelo reserva quando a cota do modelo principal se esgota antes do primeiro fragmento', async () => {
  const test = setup(async function* () {
    yield await Promise.reject(new QuotaExceededError());
  });
  expect(await collect(test.services.executeStream(input))).toEqual([output]);
  expect(test.factory).toHaveBeenCalledTimes(2);
  expect(test.notify).toHaveBeenCalledWith({
    fromProvider: 'gemini',
    fromModel: 'gemini-3.8-flash',
    toProvider: 'gemini',
    toModel: 'gemini-3.6-flash',
    reason: 'QUOTA_EXCEEDED',
  });
});
it('não troca em indisponibilidade sem classificação temporária', async () => {
  const error = new ProviderUnavailableError();
  const test = setup(async function* () {
    yield await Promise.reject(error);
  });
  await expect(collect(test.services.executeStream(input))).rejects.toBe(error);
  expect(test.factory).toHaveBeenCalledOnce();
  expect(test.notify).not.toHaveBeenCalled();
});
it('não usa reserva se a cota do modelo principal for ultrapassada após entregar conteúdo', async () => {
  const error = new QuotaExceededError();
  const test = setup(async function* () {
    yield output;
    yield await Promise.reject(error);
  });
  await expect(collect(test.services.executeStream(input))).rejects.toBe(error);
  expect(test.factory).toHaveBeenCalledOnce();
  expect(test.notify).not.toHaveBeenCalled();
});

it('preserva erro de cota da reserva sem repetir a cadeia', async () => {
  const test = setup(async function* () {
    yield await Promise.reject(new QuotaExceededError());
  });

  const original = test.factory.getMockImplementation()!;
  test.factory.mockImplementation((role, config) => ({
    ...original(role, config),
    stream: async function* () {
      yield await Promise.reject(new QuotaExceededError());
    },
  }));
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(test.factory).toHaveBeenCalledTimes(2);
  expect(test.notify).toHaveBeenCalledOnce();
});

it('mantém previews local-only no fallback local do STT', () => {
  const config = ProvidersSchema.parse({
    llm: { adapter: 'disabled' },
    stt: {
      adapter: 'deepgram',
      model: 'nova-3',
      apiKeyEnv: 'DEEPGRAM_API_KEY',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2025-01-01T00:00:00.000Z',
      policyReference: 'https://example.com/privacy',
      speechFallback: {
        adapter: 'http-json',
        endpoint: 'http://127.0.0.1:8001',
        apiKeyEnv: 'STT_SERVICE_TOKEN',
        dataPolicy: 'local-approved',
      },
    },
    tts: { adapter: 'disabled' },
  }).stt;

  expect(
    filterProviderAttemptsForDataClass(
      providerAttempts('stt', config),
      'local-only',
    ),
  ).toMatchObject([{ adapter: 'http-json', dataPolicy: 'local-approved' }]);
});

it('não troca em erro de cota quando a reserva está desativada', async () => {
  const error = new QuotaExceededError();
  const test = setup(
    async function* () {
      yield await Promise.reject(error);
    },
    { fallback: false },
  );
  await expect(collect(test.services.executeStream(input))).rejects.toBe(error);
  expect(test.factory).toHaveBeenCalledOnce();
  expect(test.notify).not.toHaveBeenCalled();
});

it.each([new ProviderUnavailableError()])(
  'não troca em falha não temporária: %s',
  async (error) => {
    const test = setup(async function* () {
      yield await Promise.reject(error);
    });
    await expect(collect(test.services.executeStream(input))).rejects.toBe(
      error,
    );
    expect(test.factory).toHaveBeenCalledOnce();
    expect(test.notify).not.toHaveBeenCalled();
  },
);
it('não mistura resposta parcial com a reserva', async () => {
  const test = setup(async function* () {
    yield output;

    throw new ProviderTemporarilyUnavailableError();
  });
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledOnce();
});
it('não troca quando o usuário cancela antes da falha', async () => {
  const abort = new AbortController();
  const test = setup(async function* () {
    abort.abort();

    yield await Promise.reject(new ProviderTemporarilyUnavailableError());
  });
  await expect(
    collect(test.services.executeStream(input, abort.signal)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledOnce();
});
it('não gera novamente após falha de persistência', async () => {
  const test = setup(
    async function* () {
      yield output;
    },
    { settlementError: true },
  );
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledOnce();
  expect(test.settle).toHaveBeenCalledOnce();
});
it('sem reserva configurada repete uma vez o mesmo modelo e preserva a falha', async () => {
  const test = setup(temporaryFailure, { fallback: false });
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledTimes(2);
  expect(test.reserve).toHaveBeenCalledTimes(2);
  expect(test.notify).not.toHaveBeenCalled();
});

it('recupera falha temporária do último provedor com nova reserva de uso', async () => {
  let requests = 0;
  const test = setup(
    async function* () {
      if (++requests === 1) {
        throw new ProviderTemporarilyUnavailableError();
      }

      yield output;
    },
    { fallback: false },
  );
  expect(await collect(test.services.executeStream(input))).toEqual([output]);
  expect(test.reserve).toHaveBeenCalledTimes(2);
  expect(test.settle.mock.calls).toEqual([
    ['gemini-3.8-flash', null],
    ['gemini-3.8-flash', output],
  ]);
  expect(test.notify).not.toHaveBeenCalled();
});

it('não repete o último provedor após cota, conteúdo parcial ou falha ao liquidar uso', async () => {
  const quota = setup(
    async function* () {
      yield await Promise.reject(new QuotaExceededError());
    },
    { fallback: false },
  );
  await expect(
    collect(quota.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(quota.factory).toHaveBeenCalledOnce();
  const partial = setup(
    async function* () {
      yield output;

      throw new ProviderTemporarilyUnavailableError();
    },
    { fallback: false },
  );
  await expect(
    collect(partial.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(partial.factory).toHaveBeenCalledOnce();
  const storage = setup(temporaryFailure, { fallback: false });
  storage.settle.mockRejectedValue(new ProviderTemporarilyUnavailableError());
  await expect(
    collect(storage.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(storage.factory).toHaveBeenCalledOnce();
});

it('cancelamento durante a espera impede nova chamada ao último provedor', async () => {
  const abort = new AbortController();
  const test = setup(temporaryFailure, { fallback: false });
  const original = test.settle.getMockImplementation()!;
  test.settle.mockImplementation(async (...args) => {
    await original(...args);
    abort.abort();
  });
  await expect(
    collect(test.services.executeStream(input, abort.signal)),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(test.factory).toHaveBeenCalledOnce();
  expect(test.release).toHaveBeenCalledOnce();
});
it('valida nomes e impede reserva idêntica ou em outro adaptador', () => {
  expect(
    ProviderSchema.safeParse({
      adapter: 'disabled',
      fallbackModel: 'gemini-3.6-flash',
    }).success,
  ).toBe(false);
  expect(
    ProviderSchema.safeParse({
      adapter: 'gemini',
      model: 'gemini-3.6-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      fallbackModel: 'gemini-3.6-flash',
    }).success,
  ).toBe(false);
  expect(
    ProviderSchema.safeParse({
      adapter: 'gemini',
      model: 'gemini-3.8-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      fallbackModel: '../invalid',
    }).success,
  ).toBe(false);
});

it('ordena reservas e preserva política individual e limites compartilhados', () => {
  const config = ProvidersSchema.parse({
    llm: {
      adapter: 'gemini',
      model: 'gemini-primary',
      apiKeyEnv: 'GEMINI_API_KEY',
      geminiTier: 'paid',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2026-01-01T00:00:00.000Z',
      policyReference: 'https://example.test/privacy',
      limits: { requestsPerDay: 30, tokensPerDay: 30000 },
      fallbackProviders: [
        {
          adapter: 'groq',
          model: 'groq-model',
          apiKeyEnv: 'GROQ_API_KEY',
          dataPolicy: 'personal-approved',
          policyReviewedAt: '2026-01-01T00:00:00.000Z',
          policyReference: 'https://example.test/groq-privacy',
        },
        {
          adapter: 'cloudflare-ai',
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
          accountId: 'a'.repeat(32),
          dataPolicy: 'personal-approved',
          policyReviewedAt: '2026-01-01T00:00:00.000Z',
          policyReference: 'https://example.test/cloudflare-privacy',
        },
      ],
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });
  const attempts = providerAttempts('llm', config.llm);

  expect(attempts.map(({ adapter, model }) => [adapter, model])).toEqual([
    ['gemini', 'gemini-primary'],
    ['groq', 'groq-model'],
    ['cloudflare-ai', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  ]);
  expect(
    attempts
      .slice(1)
      .map(({ dataPolicy, limits, policyReference }) => [
        dataPolicy,
        limits,
        policyReference,
      ]),
  ).toEqual([
    [
      'personal-approved',
      config.llm.limits,
      'https://example.test/groq-privacy',
    ],
    [
      'personal-approved',
      config.llm.limits,
      'https://example.test/cloudflare-privacy',
    ],
  ]);
  expect(
    filterProviderAttemptsForDataClass(attempts, 'personal').map(
      ({ adapter }) => adapter,
    ),
  ).toEqual(['gemini', 'groq', 'cloudflare-ai']);
});

it('usa apenas provedores explicitamente aprovados para dados pessoais', () => {
  const config = ProvidersSchema.parse({
    llm: {
      adapter: 'groq',
      model: 'groq-model',
      apiKeyEnv: 'GROQ_API_KEY',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2026-01-01T00:00:00.000Z',
      policyReference: 'https://example.test/groq-privacy',
      fallbackProviders: [
        {
          adapter: 'cloudflare-ai',
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
          accountId: 'c'.repeat(32),
          dataPolicy: 'personal-approved',
          policyReviewedAt: '2026-01-01T00:00:00.000Z',
          policyReference: 'https://example.test/cloudflare-privacy',
        },
        {
          adapter: 'gemini',
          model: 'gemini-3.8-flash',
          apiKeyEnv: 'GEMINI_API_KEY',
        },
      ],
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });

  expect(
    filterProviderAttemptsForDataClass(
      providerAttempts('llm', config.llm),
      'personal',
    ).map(({ adapter }) => adapter),
  ).toEqual(['groq', 'cloudflare-ai']);
  expect(
    filterProviderAttemptsForDataClass(
      providerAttempts('llm', config.llm),
      'synthetic',
    ).map(({ adapter }) => adapter),
  ).toEqual(['groq', 'cloudflare-ai', 'gemini']);
});

it('não envia dados pessoais a um fallback sintético após falha do provedor aprovado', async () => {
  const config = ProvidersSchema.parse({
    llm: {
      adapter: 'groq',
      model: 'groq-model',
      apiKeyEnv: 'GROQ_API_KEY',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2026-01-01T00:00:00.000Z',
      policyReference: 'https://example.test/groq-privacy',
      fallbackProviders: [
        {
          adapter: 'cloudflare-ai',
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
          accountId: 'd'.repeat(32),
          dataPolicy: 'personal-approved',
          policyReviewedAt: '2026-01-01T00:00:00.000Z',
          policyReference: 'https://example.test/cloudflare-privacy',
        },
        {
          adapter: 'gemini',
          model: 'gemini-3.8-flash',
          apiKeyEnv: 'GEMINI_API_KEY',
        },
      ],
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });
  const personalInput = { ...input, dataClass: 'personal' as const };
  const reserve = vi.fn(async (_owner, _role, provider) => provider.adapter);
  const settle = vi.fn(async () => {});
  const factory = vi.fn((_role, provider) => ({
    role: 'llm' as const,
    transport: 'sse' as const,
    nativeStreaming: true,
    health: async () => ({
      available: true,
      capabilities: {
        incrementalGeneration: true,
        progressiveDelivery: true,
        vision: false,
        customVoice: false,
        testedVoiceControls: [],
      },
    }),
    execute: async () => {
      if (provider.adapter === 'groq') {
        throw new ProviderTemporarilyUnavailableError();
      }

      return output;
    },
    stream:
      provider.adapter === 'groq'
        ? temporaryFailure
        : async function* () {
            yield output;
          },
  }));
  const notify = vi.fn();
  const release = vi.fn();
  const services = createProviderServices({
    configuration: { get: async () => config, save: async () => {} },
    usage: { reserve, settle, usage: vi.fn() },
    ownerId: 'primary',
    factory,
    gate: {
      beginConfiguration: () => release,
      beginExecution: () => release,
    },
    onFallback: notify,
  });

  expect(await collect(services.executeStream(personalInput))).toEqual([
    output,
  ]);
  expect(factory.mock.calls.map(([, provider]) => provider.adapter)).toEqual([
    'groq',
    'cloudflare-ai',
  ]);
  expect(reserve.mock.calls.map(([, , provider]) => provider.adapter)).toEqual([
    'groq',
    'cloudflare-ai',
  ]);
  expect(notify).toHaveBeenCalledWith({
    fromProvider: 'groq',
    fromModel: 'groq-model',
    toProvider: 'cloudflare-ai',
    toModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    reason: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });

  factory.mockClear();
  reserve.mockClear();
  expect(await services.execute('llm', personalInput)).toEqual(output);
  expect(factory.mock.calls.map(([, provider]) => provider.adapter)).toEqual([
    'cloudflare-ai',
  ]);
  expect(reserve.mock.calls.map(([, , provider]) => provider.adapter)).toEqual([
    'cloudflare-ai',
  ]);
});

it('valida configuração e limita reservas a LLMs remotos', () => {
  const validCloudflare = {
    adapter: 'cloudflare-ai',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
    accountId: 'b'.repeat(32),
  };
  const validGroq = {
    adapter: 'groq',
    model: 'groq-model',
    apiKeyEnv: 'GROQ_API_KEY',
  };

  expect(
    ProvidersSchema.safeParse({
      llm: {
        adapter: 'gemini',
        model: 'gemini-primary',
        apiKeyEnv: 'GEMINI_API_KEY',
        fallbackProviders: [validGroq, validCloudflare],
      },
      stt: { adapter: 'disabled' },
      tts: { adapter: 'disabled' },
    }).success,
  ).toBe(true);
  expect(
    ProviderSchema.safeParse({
      adapter: 'cloudflare-ai',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
    }).success,
  ).toBe(false);
  expect(
    ProviderSchema.safeParse({
      adapter: 'groq',
      model: 'groq-model',
      apiKeyEnv: 'GROQ_API_KEY',
      fallbackProviders: [
        {
          adapter: 'gemini',
          model: 'gemini-3.8-flash',
          apiKeyEnv: 'GEMINI_API_KEY',
          dataPolicy: 'personal-approved',
          policyReviewedAt: '2026-01-01T00:00:00.000Z',
          policyReference: 'https://example.test/gemini-privacy',
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    ProviderSchema.safeParse({
      adapter: 'gemini',
      model: 'gemini-3.8-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      geminiTier: 'paid',
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2026-01-01T00:00:00.000Z',
      policyReference: 'https://example.test/gemini-privacy',
    }).success,
  ).toBe(true);
  expect(
    ProviderSchema.safeParse({
      adapter: 'groq',
      model: 'groq-model',
      apiKeyEnv: 'GROQ_API_KEY',
      fallbackProviders: [
        {
          adapter: 'gemini',
          model: 'gemini-3.8-flash',
          apiKeyEnv: 'GEMINI_API_KEY',
          geminiTier: 'paid',
          dataPolicy: 'personal-approved',
          policyReviewedAt: '2026-01-01T00:00:00.000Z',
          policyReference: 'https://example.test/gemini-privacy',
        },
      ],
    }).success,
  ).toBe(true);
  expect(
    ProviderSchema.safeParse({
      adapter: 'groq',
      model: 'groq-model',
      apiKeyEnv: 'GROQ_API_KEY',
      fallbackProviders: Array.from({ length: 9 }, () => validGroq),
    }).success,
  ).toBe(false);
  expect(
    ProvidersSchema.safeParse({
      llm: { adapter: 'disabled', fallbackProviders: [validGroq] },
      stt: { adapter: 'disabled' },
      tts: { adapter: 'disabled' },
    }).success,
  ).toBe(false);
});

it('percorre Gemini, Groq e Cloudflare na ordem até uma resposta completa', async () => {
  const config = ProvidersSchema.parse({
    llm: {
      adapter: 'gemini',
      model: 'gemini-primary',
      apiKeyEnv: 'GEMINI_API_KEY',
      fallbackProviders: [
        {
          adapter: 'groq',
          model: 'groq-model',
          apiKeyEnv: 'GROQ_API_KEY',
        },
        {
          adapter: 'cloudflare-ai',
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          apiKeyEnv: 'CLOUDFLARE_AI_TOKEN',
          accountId: 'd'.repeat(32),
        },
      ],
    },
    stt: { adapter: 'disabled' },
    tts: { adapter: 'disabled' },
  });
  const used: string[] = [];
  const notices: ProviderFallbackNotice[] = [];
  const reserve = vi.fn(async (_owner, _role, provider) => provider.adapter);
  const settle = vi.fn(
    async (
      _id: string,
      _outcome: {
        inputTokens: number | null;
        outputTokens: number | null;
      } | null,
    ) => {
      void _id;
      void _outcome;
    },
  );
  const factory: ProviderFactory = (_role, provider) => ({
    role: 'llm',
    transport: 'sse',
    nativeStreaming: true,
    health: async () => ({
      available: true,
      capabilities: {
        incrementalGeneration: true,
        progressiveDelivery: true,
        vision: false,
        customVoice: false,
        testedVoiceControls: [],
      },
    }),
    execute: async () => output,
    stream: async function* () {
      used.push(provider.adapter);

      if (provider.adapter === 'gemini') {
        throw new QuotaExceededError();
      }

      if (provider.adapter === 'groq') {
        throw new ProviderTemporarilyUnavailableError();
      }

      yield output;
    },
  });
  const services = createProviderServices({
    configuration: { get: async () => config, save: async () => {} },
    usage: { reserve, settle, usage: vi.fn() },
    ownerId: 'primary',
    factory,
    gate: {
      beginConfiguration: () => () => {},
      beginExecution: () => () => {},
    },
    onFallback: (notice) => notices.push(notice),
  });

  expect(await collect(services.executeStream(input))).toEqual([output]);
  expect(used).toEqual(['gemini', 'groq', 'cloudflare-ai']);
  expect(reserve.mock.calls.map((call) => call[2].adapter)).toEqual(used);
  expect(settle.mock.calls.map((call) => call[1])).toEqual([
    null,
    null,
    output,
  ]);
  expect(
    notices.map(({ fromProvider, toProvider, reason }) => [
      fromProvider,
      toProvider,
      reason,
    ]),
  ).toEqual([
    ['gemini', 'groq', 'QUOTA_EXCEEDED'],
    ['groq', 'cloudflare-ai', 'PROVIDER_TEMPORARILY_UNAVAILABLE'],
  ]);
});

it('encerra após uma repetição da última reserva sem reiniciar a cadeia', async () => {
  const test = setup(temporaryFailure);
  const original = test.factory.getMockImplementation()!;
  test.factory.mockImplementation((role, config) => ({
    ...original(role, config),
    stream: temporaryFailure,
  }));
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledTimes(3);
  expect(test.settle).toHaveBeenCalledTimes(3);
  expect(test.release).toHaveBeenCalledOnce();
});

it('não chama a reserva quando seu orçamento recusa a tentativa', async () => {
  const test = setup(temporaryFailure);
  test.reserve.mockImplementation(async (_owner, _role, config) => {
    if (config.model === 'gemini-3.6-flash') {
      throw new QuotaExceededError();
    }

    return config.model;
  });
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(test.factory).toHaveBeenCalledOnce();
  expect(test.release).toHaveBeenCalledOnce();
});

for (const mode of ['stream', 'execute'] as const) {
  it(`usa a reserva após cota local do principal em ${mode}`, async () => {
    const test = setup(temporaryFailure);
    test.reserve.mockImplementation(async (_owner, _role, config) => {
      if (config.model === 'gemini-3.8-flash') {
        throw new QuotaExceededError();
      }

      return config.model;
    });
    const result =
      mode === 'stream'
        ? await collect(test.services.executeStream(input))
        : [await test.services.execute('llm', input)];
    expect(result).toEqual([output]);
    expect(test.reserve.mock.calls.map((call) => call[2].model)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ]);
    expect(test.factory).toHaveBeenCalledOnce();
    expect(test.factory.mock.calls[0]?.[1].model).toBe('gemini-3.6-flash');
    expect(test.settle).toHaveBeenCalledOnce();
    expect(test.notify).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'QUOTA_EXCEEDED' }),
    );
    expect(test.release).toHaveBeenCalledOnce();
  });

  it(`falha de persistência na reserva não inicia outro provedor em ${mode}`, async () => {
    const test = setup(temporaryFailure);
    test.reserve.mockRejectedValue(
      new ProviderTemporarilyUnavailableError('storage failure'),
    );
    const promise =
      mode === 'stream'
        ? collect(test.services.executeStream(input))
        : test.services.execute('llm', input);
    await expect(promise).rejects.toThrow('storage failure');
    expect(test.reserve).toHaveBeenCalledOnce();
    expect(test.factory).not.toHaveBeenCalled();
    expect(test.settle).not.toHaveBeenCalled();
  });

  it(`encerra quando todas as cotas locais elegíveis acabam em ${mode}`, async () => {
    const test = setup(temporaryFailure);
    test.reserve.mockRejectedValue(new QuotaExceededError());
    const promise =
      mode === 'stream'
        ? collect(test.services.executeStream(input))
        : test.services.execute('llm', input);
    await expect(promise).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(test.reserve).toHaveBeenCalledTimes(2);
    expect(test.factory).not.toHaveBeenCalled();
    expect(test.settle).not.toHaveBeenCalled();
  });
}

it('pula um provedor em pausa entre turnos de streaming e execucao', async () => {
  const test = setup(temporaryFailure, {
    executeError: new ProviderTemporarilyUnavailableError(),
  });
  await collect(test.services.executeStream(input));
  test.factory.mockClear();
  test.reserve.mockClear();
  await test.services.execute('llm', input);
  expect(test.factory.mock.calls.map(([, config]) => config.model)).toEqual([
    'gemini-3.6-flash',
  ]);
  expect(test.reserve).toHaveBeenCalledOnce();
});

it('não repete a última reserva antes do Retry-After explícito', async () => {
  const error = new ProviderTemporarilyUnavailableError();
  error.retryAfterMs = 120000;
  const test = setup(
    async function* () {
      yield await Promise.reject(error);
    },
    { fallback: false },
  );
  await expect(collect(test.services.executeStream(input))).rejects.toBe(error);
  expect(test.factory).toHaveBeenCalledOnce();
});
