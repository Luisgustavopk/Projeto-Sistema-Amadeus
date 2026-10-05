import { expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createRevisionRepository } from '../../src/adapters/database/revision-repository.ts';
import { createPersonaConfiguration } from '../../src/application/persona/configuration.ts';

const token = 'test-only-credential-of-more-than-32-characters';
const headers = { authorization: `Bearer ${token}` };

it('protege configuração, valida tags e conflitos e persiste a persona por proprietário', async () => {
  const db = await openDatabase('file::memory:');
  const app = await buildApp({
    token,
    database: db,
    config: loadConfig({ API_ACCESS_TOKEN: token }),
  });

  try {
    expect(
      (await app.inject({ method: 'GET', url: '/v1/persona' })).statusCode,
    ).toBe(401);
    const initial = (
      await app.inject({ method: 'GET', url: '/v1/persona', headers })
    ).json();
    expect(initial.revision).toBe(0);
    const changed = await app.inject({
      method: 'PUT',
      url: '/v1/persona',
      headers,
      payload: { expectedRevision: 0, direction: 'Fale com exemplos curtos.' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().revision).toBe(1);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/persona',
          headers,
          payload: { expectedRevision: 0, direction: 'Outra edição.' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/persona',
          headers,
          payload: {
            expectedRevision: 1,
            direction: '<expression>inválido</expression>',
          },
        })
      ).statusCode,
    ).toBe(400);
    const repo = createRevisionRepository(db.client);
    const restarted = createPersonaConfiguration(
      repo,
      loadConfig({ API_ACCESS_TOKEN: token }).OWNER_ID,
    );
    expect((await restarted.get()).direction).toBe('Fale com exemplos curtos.');
    expect(
      (await createPersonaConfiguration(repo, 'another-owner').get()).revision,
    ).toBe(0);
    const editor = createPersonaConfiguration(
      repo,
      loadConfig({ API_ACCESS_TOKEN: token }).OWNER_ID,
    );
    const concurrent = await Promise.allSettled([
      editor.update({
        expectedRevision: 1,
        direction: 'Primeira atualização simultânea.',
      }),
      editor.update({
        expectedRevision: 1,
        direction: 'Segunda atualização simultânea.',
      }),
    ]);
    expect(concurrent.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await editor.get()).revision).toBe(2);
  } finally {
    await app.close();
  }
});

it('guarda e restaura clone/modelo sem alterar LLM/STT nem incluir segredos', async () => {
  const app = await buildApp({
    token,
    config: loadConfig({ API_ACCESS_TOKEN: token }),
    secrets: { CARTESIA_API_KEY: 'secret-must-not-appear' },
  });

  try {
    const config = (
      await app.inject({ method: 'GET', url: '/v1/providers', headers })
    ).json();
    const first = {
      ...config,
      tts: {
        adapter: 'cartesia',
        model: 'sonic-3.6',
        voiceId: 'dd8e6bee-2225-418a-9e68-753f3ec73b6b',
        apiKeyEnv: 'CARTESIA_API_KEY',
      },
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/providers',
          headers,
          payload: first,
        })
      ).statusCode,
    ).toBe(200);
    const saved = await app.inject({
      method: 'POST',
      url: '/v1/voice/versions',
      headers,
      payload: { name: 'Voz aceita' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('secret-must-not-appear');
    expect(saved.json().synthesis).toMatchObject({
      sampleRate: 24000,
      accent: 'brazilian-portuguese',
      maxSegmentCharacters: 220,
    });
    const second = {
      ...first,
      tts: { ...first.tts, voiceId: '0e10d764-f2ef-4707-93d6-b2078385dcc1' },
    };
    await app.inject({
      method: 'PUT',
      url: '/v1/providers',
      headers,
      payload: second,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/voice/versions/${saved.json().id}/restore`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const restored = (
      await app.inject({ method: 'GET', url: '/v1/providers', headers })
    ).json();
    expect(restored.tts.voiceId).toBe(first.tts.voiceId);
    expect(restored.llm).toEqual(config.llm);
    expect(restored.stt).toEqual(config.stt);
    expect(
      (
        await app.inject({ method: 'GET', url: '/v1/voice/versions', headers })
      ).json().versions,
    ).toHaveLength(1);
  } finally {
    await app.close();
  }
});
