import { expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { SqliteProviderConfigurationRepository } from '../../src/adapters/database/provider-configuration-repository.ts';
import { DEFAULT_PROVIDERS } from '../../src/domain/providers/model.ts';
import { loadConfig } from '../../src/config/index.ts';

it('protege diagnóstico do núcleo e persiste seleção refinada e expressiva sem mudar consentimento', async () => {
  const token = 'test-only-credential-of-more-than-32-characters';
  const headers = { authorization: `Bearer ${token}` };
  const app = await buildApp({ token });

  try {
    expect(
      (await app.inject({ url: '/v1/voice/runtime/acting' })).statusCode,
    ).toBe(401);
    const initial = (
      await app.inject({ url: '/v1/voice/runtime', headers })
    ).json();
    const update = await app.inject({
      method: 'PUT',
      url: '/v1/voice/runtime',
      headers,
      payload: {
        expectedRevision: initial.revision,
        options: {
          ...initial.options,
          expressionMode: 'expressive',
          actingMode: 'refined',
        },
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().options.observerPersonalConsent).toBe(false);
    const acting = (
      await app.inject({ url: '/v1/voice/runtime/acting', headers })
    ).json();
    expect(acting).toMatchObject({ mode: 'refined' });
    expect(acting.coreHash).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    await app.close();
  }
});

it('protege as opções, mantém consentimento desligado, valida revisão e rejeita troca sem pagamento configurado', async () => {
  const token = 'test-only-credential-of-more-than-32-characters';
  const headers = { authorization: `Bearer ${token}` };
  const app = await buildApp({ token });

  try {
    expect((await app.inject({ url: '/v1/voice/runtime' })).statusCode).toBe(
      401,
    );
    const initial = (
      await app.inject({ url: '/v1/voice/runtime', headers })
    ).json();
    expect(initial.options).toMatchObject({
      expressionMode: 'embedded',
      firstFlushMs: 700,
      observerPersonalConsent: false,
    });
    const payload = {
      expectedRevision: initial.revision,
      options: {
        ...initial.options,
        expressionMode: 'parallel',
        firstFlushMs: 200,
      },
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/voice/runtime',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/voice/runtime',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/voice/runtime',
          headers,
          payload: {
            ...payload,
            expectedRevision: 1,
            options: { ...payload.options, firstFlushMs: 0 },
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/voice/runtime/author',
          headers,
          payload: { author: 'deepseek' },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});

it('escolhe DeepSeek e Llama com a mesma credencial sem executar requisições remotas', async () => {
  const token = 'test-only-credential-of-more-than-32-characters';
  const config = loadConfig({ API_ACCESS_TOKEN: token });
  const database = await openDatabase('file::memory:');
  const repository = new SqliteProviderConfigurationRepository(database.client);
  await repository.save(config.OWNER_ID, {
    ...DEFAULT_PROVIDERS,
    llm: {
      adapter: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      dataPolicy: 'synthetic-only',
      openRouterPaid: { maxPromptPrice: 0.1, maxCompletionPrice: 0.32 },
      limits: {
        enforced: false,
        requestsPerDay: 100,
        tokensPerDay: 1000000,
        source: 'operator',
      },
    },
  });
  const app = await buildApp({
    token,
    config,
    database,
    secrets: { OPENROUTER_API_KEY: 'fake-test-key-never-sent' },
  });

  try {
    for (const author of ['deepseek', 'llama']) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/voice/runtime/author',
        headers: { authorization: `Bearer ${token}` },
        payload: { author },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().llm).toMatchObject({
        apiKeyEnv: 'OPENROUTER_API_KEY',
        limits: { enforced: false },
      });
      expect(response.json().llm.model).toBe(
        author === 'llama'
          ? 'meta-llama/llama-3.3-70b-instruct'
          : 'deepseek/deepseek-v4.1-flash',
      );
    }
  } finally {
    await app.close();
  }
});
