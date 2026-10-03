import { expect, it, vi } from 'vitest';
import {
  ProvidersSchema,
  ProviderSchema,
} from '../../src/domain/providers/model.ts';
import {
  ProviderTemporarilyUnavailableError,
  ProviderUnavailableError,
  QuotaExceededError,
} from '../../src/domain/errors/providers.ts';
import { createProviderServices } from '../../src/application/providers/index.ts';
import type { Provider, ProviderOutput } from '../../src/ports/provider.ts';

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
    fromModel: 'gemini-3.8-flash',
    toModel: 'gemini-3.6-flash',
    reason: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });
  expect(test.release).toHaveBeenCalledOnce();
});
it('também usa reserva na execução sem streaming', async () => {
  const test = setup(temporaryFailure, {
    executeError: new ProviderTemporarilyUnavailableError(),
  });
  expect(await test.services.execute('llm', input)).toEqual(output);
  expect(test.factory).toHaveBeenCalledTimes(2);
  expect(test.release).toHaveBeenCalledOnce();
});
it.each([new QuotaExceededError(), new ProviderUnavailableError()])(
  'não troca em erro de cota ou indisponibilidade sem classificação temporária: %s',
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
it('sem reserva configurada preserva falha e não inicia outro modelo', async () => {
  const test = setup(temporaryFailure, { fallback: false });
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledOnce();
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

it('encerra após falha da reserva sem repetir a cadeia', async () => {
  const test = setup(temporaryFailure);
  const original = test.factory.getMockImplementation()!;
  test.factory.mockImplementation((role, config) => ({
    ...original(role, config),
    stream: temporaryFailure,
  }));
  await expect(
    collect(test.services.executeStream(input)),
  ).rejects.toMatchObject({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' });
  expect(test.factory).toHaveBeenCalledTimes(2);
  expect(test.settle).toHaveBeenCalledTimes(2);
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
