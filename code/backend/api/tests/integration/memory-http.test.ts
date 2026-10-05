import { expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createMemoryRepository } from '../../src/adapters/database/memory-repository.ts';
import { FactInputSchema } from '../../src/domain/memory/model.ts';
import { loadConfig } from '../../src/config/index.ts';

const token = 'test-only-credential-of-more-than-32-characters';
const headers = { authorization: `Bearer ${token}` };

it('persiste a opção de aprovação automática e recusa mudanças com revisão antiga', async () => {
  const app = await buildApp({ token });

  try {
    const payload = {
      expectedRevision: 0,
      enabled: true,
      personalEnabled: false,
      extraction: 'local',
      retentionDays: null,
      autoApprove: true,
    };
    const changed = await app.inject({
      method: 'PUT',
      url: '/v1/memory/policy',
      headers,
      payload,
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ revision: 1, autoApprove: true });
    expect(
      (await app.inject({ url: '/v1/memory/status', headers })).json().policy
        .autoApprove,
    ).toBe(true);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/memory/policy',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    const off = await app.inject({
      method: 'PUT',
      url: '/v1/memory/policy',
      headers,
      payload: { ...payload, expectedRevision: 1, autoApprove: false },
    });
    expect(off.json()).toMatchObject({ revision: 2, autoApprove: false });
  } finally {
    await app.close();
  }
});

it('protege rotas, valida versões e documenta a gestão de memória no OpenAPI', async () => {
  const app = await buildApp({ token });

  try {
    expect(
      (await app.inject({ method: 'POST', url: '/v1/memory/consolidate' }))
        .statusCode,
    ).toBe(401);
    const consolidation = await app.inject({
      method: 'POST',
      url: '/v1/memory/consolidate',
      headers,
    });
    expect(consolidation.statusCode).toBe(200);
    expect(consolidation.json()).toEqual({ merged: 0, skipped: 0 });

    for (const url of [
      '/v1/facts',
      '/v1/memory/policy',
      '/v1/memory/status',
      '/v1/memory/extractor',
      '/v1/memory/summaries',
      '/v1/memory/export',
      '/v1/conversations',
    ]) {
      expect((await app.inject({ url })).statusCode).toBe(401);
    }

    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/facts',
      headers,
      payload: { text: 'Fato', category: 'preferencia', dataClass: 'personal' },
    });
    expect(invalid.statusCode).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/facts',
      headers,
      payload: {
        text: 'Amadeus usa Cartesia.',
        category: 'projeto',
        dataClass: 'synthetic',
        permission: 'eligible',
        relation: { subject: 'Amadeus', predicate: 'usa', object: 'Cartesia' },
      },
    });
    expect(created.statusCode).toBe(201);
    const fact = created.json();
    const changed = await app.inject({
      method: 'PATCH',
      url: `/v1/facts/${fact.id}`,
      headers,
      payload: {
        text: 'Amadeus usa voz clonada.',
        category: 'projeto',
        dataClass: 'synthetic',
        permission: 'eligible',
        relation: null,
        status: 'confirmed',
        expectedVersion: 1,
      },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().version).toBe(2);
    const stale = await app.inject({
      method: 'DELETE',
      url: `/v1/facts/${fact.id}`,
      headers,
      payload: { expectedVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    const erased = await app.inject({
      method: 'DELETE',
      url: `/v1/facts/${fact.id}`,
      headers,
      payload: { expectedVersion: 2 },
    });
    expect(erased.statusCode).toBe(200);
    const exported = await app.inject({ url: '/v1/memory/export', headers });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['cache-control']).toBe('no-store');
    expect(exported.body).not.toContain(token);
    expect(exported.json().memory_facts).toEqual([]);
    const spec = (
      await app.inject({ url: '/v1/openapi.json', headers })
    ).json();
    expect(spec.paths['/v1/facts/{id}'].patch.requestBody).toBeDefined();
    expect(spec.paths['/v1/memory/policy'].put.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(
      (await app.inject({ url: '/v1/memory/policy', headers })).json(),
    ).toMatchObject({
      personalEnabled: false,
      autoApprove: false,
      extraction: 'local',
      retentionDays: null,
    });
  } finally {
    await app.close();
  }
});

it('configura somente o extrator sem alterar os provedores da conversa e valida revisões', async () => {
  const app = await buildApp({
    token,
    secrets: { GROQ_API_KEY: 'synthetic-test-key' },
  });

  try {
    const before = (await app.inject({ url: '/v1/providers', headers })).body;
    const current = await app.inject({ url: '/v1/memory/extractor', headers });
    expect(current.statusCode).toBe(200);
    expect(current.json().provider.adapter).toBe('disabled');
    const payload = {
      expectedRevision: 0,
      freeOnly: true,
      provider: {
        adapter: 'groq',
        model: 'openai/gpt-oss-20b',
        apiKeyEnv: 'GROQ_API_KEY',
        limits: { requestsPerDay: 50, tokensPerDay: 200000 },
      },
    };
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/memory/extractor',
      headers,
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().revision).toBe(1);
    expect((await app.inject({ url: '/v1/providers', headers })).body).toBe(
      before,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/memory/extractor',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    const status = await app.inject({ url: '/v1/memory/status', headers });
    expect(status.statusCode).toBe(200);
    expect(status.json().extractor.configuration.provider.model).toBe(
      'openai/gpt-oss-20b',
    );
    const spec = (
      await app.inject({ url: '/v1/openapi.json', headers })
    ).json();
    expect(spec.paths['/v1/memory/extractor'].put.requestBody).toBeDefined();
  } finally {
    await app.close();
  }
});

it('exporta só o proprietário autenticado e rejeita dados de outro proprietário', async () => {
  const database = await openDatabase('file::memory:');
  const config = loadConfig({ API_ACCESS_TOKEN: token });
  const other = createMemoryRepository(database.client, 'other');
  await other.createFact(
    FactInputSchema.parse({
      text: 'Segredo do outro proprietário.',
      category: 'contexto',
      dataClass: 'synthetic',
    }),
  );
  const app = await buildApp({ token, database, config });

  try {
    const foreign = (await other.facts())[0]!;
    const erased = await app.inject({
      method: 'DELETE',
      url: `/v1/facts/${foreign.id}`,
      headers,
      payload: { expectedVersion: 1 },
    });
    expect(erased.statusCode).toBe(404);
    const exported = await app.inject({ url: '/v1/memory/export', headers });
    expect(exported.body).not.toContain('Segredo');
    expect(await other.facts()).toHaveLength(1);
  } finally {
    await app.close();
  }
});
