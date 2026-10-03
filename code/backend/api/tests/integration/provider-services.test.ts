import { afterEach, expect, it } from 'vitest';
import Fastify from 'fastify';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { SqliteProviderConfigurationRepository } from '../../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../../src/adapters/database/provider-usage-repository.ts';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';
import { createProviderServices } from '../../src/application/providers/index.ts';
import { createProvider } from '../../src/adapters/providers/http-json.ts';
import {
  DEFAULT_PROVIDERS,
  ProvidersSchema,
} from '../../src/domain/providers/model.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) {
    await close();
  }
});

async function fixture(
  options: {
    failure?: boolean;
    unknownUsage?: boolean;
    delay?: Promise<void>;
  } = {},
) {
  let calls = 0;
  const service = Fastify();
  service.get('/health', async () => ({
    protocolVersion: '1.0',
    role: 'llm',
    status: 'ok',
    capabilities: {
      incrementalGeneration: true,
      progressiveDelivery: true,
      vision: true,
      customVoice: false,
      testedVoiceControls: [],
    },
  }));
  service.post('/execute', async (_request, reply) => {
    calls++;

    if (options.delay) {
      await options.delay;
    }

    if (options.failure) {
      return reply.code(503).send({ error: 'sensitive-upstream-detail' });
    }

    return {
      content: 'synthetic response',
      inputTokens: options.unknownUsage ? null : 3,
      outputTokens: options.unknownUsage ? null : 2,
    };
  });
  const endpoint = await service.listen({ host: '127.0.0.1', port: 0 });
  cleanups.push(() => service.close());
  const database = await openDatabase('file::memory:');
  cleanups.push(async () => database.client.close());
  const configuration = new SqliteProviderConfigurationRepository(
    database.client,
  );
  const usageRepository = new SqliteProviderUsageRepository(database.client);
  const gate = new ActivityGate(2);
  const registry = createProviderServices({
    configuration,
    usage: usageRepository,
    ownerId: 'primary',
    factory: (role, config) => createProvider(role, config, {}),
    gate,
  });
  const config = ProvidersSchema.parse({
    ...DEFAULT_PROVIDERS,
    llm: {
      adapter: 'http-json',
      endpoint,
      limits: { requestsPerDay: 2, tokensPerDay: 1000 },
    },
  });
  await registry.configure(config);

  return {
    registry,
    configuration,
    usageRepository,
    gate,
    config,
    calls: () => calls,
  };
}

const input = {
  content: 'fictional user',
  dataClass: 'synthetic' as const,
  maxTokens: 10,
};
it('troca adaptadores e distingue capacidades do serviço do transporte real', async () => {
  const f = await fixture();
  const state = await f.registry.describe();
  expect(state[0]).toMatchObject({
    available: true,
    capabilities: { incrementalGeneration: true },
    nativeStreaming: false,
    transport: 'buffered-json',
  });
  await f.registry.configure(DEFAULT_PROVIDERS);
  await expect(f.registry.execute('llm', input)).rejects.toMatchObject({
    code: 'PROVIDER_DISABLED',
  });
  expect(f.calls()).toBe(0);
});
it('bloqueia dados pessoais e locais antes de qualquer envio ou reserva', async () => {
  const f = await fixture();

  for (const dataClass of ['personal', 'local-only'] as const) {
    await expect(
      f.registry.execute('llm', { ...input, dataClass }),
    ).rejects.toMatchObject({ code: 'DATA_POLICY_BLOCKED' });
  }

  expect(f.calls()).toBe(0);
  expect((await f.registry.usage())[0]?.requests).toBe(0);
});
it('exige revisão da política para habilitar dados pessoais', async () => {
  const f = await fixture();
  expect(() =>
    ProvidersSchema.parse({
      ...f.config,
      llm: { ...f.config.llm, dataPolicy: 'personal-approved' },
    }),
  ).toThrow();
  await f.registry.configure(
    ProvidersSchema.parse({
      ...f.config,
      llm: {
        ...f.config.llm,
        dataPolicy: 'personal-approved',
        policyReviewedAt: new Date().toISOString(),
        policyReference: 'https://example.org/privacy',
      },
    }),
  );
  await f.registry.execute('llm', { ...input, dataClass: 'personal' });
  expect(f.calls()).toBe(1);
});
it('reserva orçamento, registra valores reportados e bloqueia a terceira chamada', async () => {
  const f = await fixture();
  await f.registry.execute('llm', input);
  await f.registry.execute('llm', input);
  await expect(f.registry.execute('llm', input)).rejects.toMatchObject({
    code: 'QUOTA_EXCEEDED',
  });
  const usage = (await f.registry.usage())[0]!;
  expect(usage).toMatchObject({
    requests: 2,
    reportedInputTokens: 6,
    reportedOutputTokens: 4,
    estimatedRequests: 0,
  });
  expect(usage.budgetTokens).toBe(48);
  expect(f.calls()).toBe(2);
});
it('mantém reservas conservadoras quando falha ou não há consumo reportado', async () => {
  const f = await fixture({ failure: true });
  await expect(f.registry.execute('llm', input)).rejects.toMatchObject({
    code: 'PROVIDER_UNAVAILABLE',
  });
  expect((await f.registry.usage())[0]).toMatchObject({
    requests: 1,
    budgetTokens: 24,
    estimatedRequests: 1,
  });
  const unknown = await fixture({ unknownUsage: true });
  await unknown.registry.execute('llm', input);
  expect((await unknown.registry.usage())[0]).toMatchObject({
    requests: 1,
    estimatedRequests: 1,
    reportedInputTokens: 0,
  });
});
it('impede configuração durante uma operação e exige segredo configurado', async () => {
  let finish: () => void = () => {};

  const delay = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const f = await fixture({ delay });
  const pending = f.registry.execute('llm', input);

  try {
    await expect(f.registry.configure(DEFAULT_PROVIDERS)).rejects.toMatchObject(
      { code: 'PROVIDER_BUSY' },
    );
  } finally {
    finish();
    await pending;
  }

  await expect(
    f.registry.configure(
      ProvidersSchema.parse({
        ...f.config,
        llm: { ...f.config.llm, apiKeyEnv: 'MISSING_SECRET' },
      }),
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_CONFIGURATION' });
});
it('isola configuração e consumo por proprietário', async () => {
  const f = await fixture();
  await f.registry.execute('llm', input);
  const other = createProviderServices({
    configuration: f.configuration,
    usage: f.usageRepository,
    ownerId: 'another-owner',
    factory: (role, config) => createProvider(role, config, {}),
    gate: f.gate,
  });
  expect((await other.describe())[0]?.adapter).toBe('disabled');
  expect((await other.usage())[0]?.requests).toBe(0);
});
it('não ultrapassa o orçamento em operações concorrentes', async () => {
  const f = await fixture();
  await f.registry.configure(
    ProvidersSchema.parse({
      ...f.config,
      llm: {
        ...f.config.llm,
        limits: { requestsPerDay: 1, tokensPerDay: 1000 },
      },
    }),
  );
  const results = await Promise.allSettled([
    f.registry.execute('llm', input),
    f.registry.execute('llm', input),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.find((r) => r.status === 'rejected');
  expect(rejected?.status === 'rejected' && rejected.reason.code).toBe(
    'QUOTA_EXCEEDED',
  );
  expect(f.calls()).toBe(1);
});
it('rejeita classificação desconhecida e orçamento inválido antes do envio', async () => {
  const f = await fixture();
  await expect(
    f.registry.execute('llm', { ...input, maxTokens: -1 }),
  ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_INPUT' });
  expect(f.calls()).toBe(0);
});

it('preserva o consumo concluído se houver tentativa de finalização repetida', async () => {
  const fixtureState = await fixture();
  const reservation = await fixtureState.usageRepository.reserve(
    'primary',
    'llm',
    fixtureState.config.llm,
    20,
  );
  await fixtureState.usageRepository.settle(reservation, {
    inputTokens: 3,
    outputTokens: 2,
  });
  await fixtureState.usageRepository.settle(reservation, null);

  const usage = await fixtureState.usageRepository.usage(
    'primary',
    'llm',
    fixtureState.config.llm,
  );
  expect(usage).toMatchObject({
    requests: 1,
    reportedInputTokens: 3,
    reportedOutputTokens: 2,
    estimatedRequests: 0,
  });
});
