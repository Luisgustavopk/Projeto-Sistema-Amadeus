import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createRevisionRepository } from '../../src/adapters/database/revision-repository.ts';
import { SqliteProviderConfigurationRepository } from '../../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../../src/adapters/database/provider-usage-repository.ts';
import { createMemoryProvider } from '../../src/application/memory/provider.ts';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';
import {
  DEFAULT_PROVIDERS,
  ProviderSchema,
} from '../../src/domain/providers/model.ts';
import type { ProviderFactory } from '../../src/ports/provider.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

async function fixture() {
  const database = await openDatabase('file::memory:');
  cleanups.push(() => database.client.close());
  const conversationConfiguration = new SqliteProviderConfigurationRepository(
    database.client,
  );
  const usage = new SqliteProviderUsageRepository(database.client);
  const conversation = ProviderSchema.parse({
    adapter: 'groq',
    model: 'qwen/qwen3.8-27b',
    apiKeyEnv: 'GROQ_API_KEY',
    limits: { requestsPerDay: 100, tokensPerDay: 200000 },
  });
  await conversationConfiguration.save('primary', {
    ...DEFAULT_PROVIDERS,
    llm: conversation,
  });
  const execute = vi.fn(async () => ({
    content: '{"facts":[]}',
    inputTokens: 2,
    outputTokens: 2,
  }));
  const factory = vi.fn<ProviderFactory>((role) => ({
    role,
    transport: 'buffered-json',
    nativeStreaming: false,
    health: async () => {
      throw new Error('unused');
    },
    execute,
  }));
  const deps = {
    revisions: createRevisionRepository(database.client),
    conversationConfiguration,
    usage,
    ownerId: 'primary',
    factory,
    gate: new ActivityGate(1),
  };
  const provider = ProviderSchema.parse({
    ...conversation,
    model: 'openai/gpt-oss-20b',
  });
  const service = createMemoryProvider(deps);
  await service.configure({ expectedRevision: 0, freeOnly: true, provider });

  return { service, deps, execute, factory, conversation, provider };
}

it('persiste um extrator separado e não contabiliza seu uso na conversa', async () => {
  const f = await fixture();
  await f.service.execute('llm', {
    content: 'Dados sintéticos',
    maxTokens: 10,
    dataClass: 'synthetic',
    purpose: 'memory',
  });
  expect((await f.service.describeMemory()).usage.requests).toBe(1);
  expect(
    (await f.deps.usage.usage('primary', 'llm', f.conversation)).requests,
  ).toBe(0);
  expect(
    (await f.deps.conversationConfiguration.get('primary')).llm.model,
  ).toBe('qwen/qwen3.8-27b');
  expect((await createMemoryProvider(f.deps).get()).provider.model).toBe(
    'openai/gpt-oss-20b',
  );
  await expect(
    f.service.configure({
      expectedRevision: 0,
      freeOnly: true,
      provider: f.provider,
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_BUSY' });
});
it('falhas do extrator não acionam os modelos da conversa', async () => {
  const f = await fixture();
  f.execute.mockRejectedValueOnce(new Error('Dedicated service failed'));
  f.factory.mockClear();
  await expect(
    f.service.execute('llm', {
      content: 'Dados sintéticos',
      maxTokens: 10,
      dataClass: 'synthetic',
      purpose: 'memory',
    }),
  ).rejects.toThrow('Dedicated service failed');
  expect(f.factory.mock.calls.map((call) => call[1].model)).toEqual([
    'openai/gpt-oss-20b',
  ]);
  expect((await f.service.describeMemory()).usage.requests).toBe(1);
});
it('persiste o perfil Z.ai com chave e orçamento próprios sem modificar a conversa', async () => {
  const f = await fixture();
  await f.service.configure({
    expectedRevision: 1,
    freeOnly: true,
    provider: {
      adapter: 'zai',
      model: 'glm-4.7-flash',
      apiKeyEnv: 'ZAI_GLM_FLASH',
      limits: { requestsPerDay: 50, tokensPerDay: 200000 },
      dataPolicy: 'personal-approved',
      policyReviewedAt: '2026-10-05T19:30:42.000Z',
      policyReference: 'https://docs.z.ai/legal-agreement/privacy-policy',
    },
  });
  await f.service.execute('llm', {
    content: 'Declaração fictícia',
    purpose: 'memory',
    dataClass: 'personal',
    maxTokens: 100,
  });
  expect((await createMemoryProvider(f.deps).get()).provider).toMatchObject({
    adapter: 'zai',
    apiKeyEnv: 'ZAI_GLM_FLASH',
  });
  expect(f.factory.mock.lastCall?.[1]).toMatchObject({
    adapter: 'zai',
    model: 'glm-4.7-flash',
    apiKeyEnv: 'ZAI_GLM_FLASH',
  });
  expect((await f.service.describeMemory()).usage.requests).toBe(1);
  expect((await f.deps.conversationConfiguration.get('primary')).llm).toEqual(
    f.conversation,
  );
  expect(
    (await f.deps.usage.usage('primary', 'llm', f.conversation)).requests,
  ).toBe(0);
});
it('rejeita modelos da conversa, reservas, Gemini pago e dados pessoais no Gemini gratuito', async () => {
  const f = await fixture();
  await expect(
    f.service.configure({
      expectedRevision: 1,
      freeOnly: true,
      provider: f.conversation,
    }),
  ).rejects.toThrow();
  await expect(
    f.service.configure({
      expectedRevision: 1,
      freeOnly: true,
      provider: {
        ...f.provider,
        fallbackProviders: [
          { adapter: 'groq', model: 'other', apiKeyEnv: 'GROQ_API_KEY' },
        ],
      },
    }),
  ).rejects.toThrow();
  await expect(
    f.service.configure({
      expectedRevision: 1,
      freeOnly: true,
      provider: {
        adapter: 'gemini',
        model: 'gemini-test',
        apiKeyEnv: 'GEMINI_API_KEY',
        geminiTier: 'paid',
      },
    }),
  ).rejects.toThrow();
  await f.service.configure({
    expectedRevision: 1,
    freeOnly: true,
    provider: {
      adapter: 'gemini',
      model: 'gemini-test',
      apiKeyEnv: 'GEMINI_API_KEY',
      geminiTier: 'unpaid',
      limits: { requestsPerDay: 100, tokensPerDay: 200000 },
    },
  });
  await expect(
    f.service.execute('llm', {
      content: 'Conversa real',
      maxTokens: 10,
      dataClass: 'personal',
      purpose: 'memory',
    }),
  ).rejects.toMatchObject({ code: 'DATA_POLICY_BLOCKED' });
  expect(f.execute).not.toHaveBeenCalled();
});
