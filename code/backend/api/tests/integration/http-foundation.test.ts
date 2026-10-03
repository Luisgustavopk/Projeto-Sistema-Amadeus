import { afterEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/index.ts';

const token = 'test-only-credential-of-more-than-32-characters';
const headers = { authorization: `Bearer ${token}` };
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function setup(extra: NodeJS.ProcessEnv = {}) {
  const app = await buildApp({
    token,
    config: loadConfig({
      API_ACCESS_TOKEN: token,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      ...extra,
    }),
  });
  apps.push(app);

  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

it('responde 400 para endpoint malformado e preserva a configuração', async () => {
  const app = await setup();
  const before = (await app.inject({ url: '/v1/providers', headers })).json();
  const result = await app.inject({
    method: 'PUT',
    url: '/v1/providers',
    headers,
    payload: {
      ...before,
      llm: { adapter: 'http-json', endpoint: 'not-a-url' },
    },
  });
  expect(result.statusCode).toBe(400);
  expect((await app.inject({ url: '/v1/providers', headers })).json()).toEqual(
    before,
  );
});

it('protege todos os endpoints de diagnóstico e configuração', async () => {
  const app = await setup();

  for (const url of [
    '/v1/health/details',
    '/v1/usage',
    '/v1/providers',
    '/v1/metrics',
    '/v1/voice/protocol',
    '/v1/providers/protocol',
  ]) {
    expect((await app.inject(url)).statusCode).toBe(401);
  }

  const health = await app.inject({ url: '/v1/health/details', headers });
  expect(health.statusCode).toBe(200);
  expect(health.json().database).toBe('ok');
  const usage = (await app.inject({ url: '/v1/usage', headers })).json();
  expect(usage.automaticPaidFallback).toBe(false);
  expect(
    usage.providers.every((p: { requests: number }) => p.requests === 0),
  ).toBe(true);
});
it('valida configuração sem ecoar segredos e conserva o estado após falha', async () => {
  const app = await setup();
  const before = (await app.inject({ url: '/v1/providers', headers })).json();
  const response = await app.inject({
    method: 'PUT',
    url: '/v1/providers',
    headers,
    payload: {
      ...before,
      llm: { adapter: 'nonexistent', apiKey: 'super-secret' },
    },
  });
  expect(response.statusCode).toBe(400);
  expect(response.body).not.toContain('super-secret');
  expect((await app.inject({ url: '/v1/providers', headers })).json()).toEqual(
    before,
  );
});
it('valida origem e responde ao preflight sem exigir token', async () => {
  const app = await setup();
  expect(
    (
      await app.inject({
        url: '/v1/usage',
        headers: { ...headers, origin: 'https://evil.example' },
      })
    ).statusCode,
  ).toBe(403);
  const result = await app.inject({
    method: 'OPTIONS',
    url: '/v1/providers',
    headers: { origin: 'http://localhost:5173' },
  });
  expect(result.statusCode).toBe(204);
  expect(result.headers['access-control-allow-origin']).toBe(
    'http://localhost:5173',
  );
  expect(
    (
      await app.inject({
        url: '/v1/usage',
        headers: { ...headers, origin: 'http://localhost:5173' },
      })
    ).statusCode,
  ).toBe(200);
});
it('limita requisições e oferece Retry-After', async () => {
  const app = await setup({ HTTP_REQUESTS_PER_MINUTE: '10' });

  for (let i = 0; i < 10; i++) {
    expect((await app.inject('/v1/health')).statusCode).toBe(200);
  }

  const denied = await app.inject('/v1/health');
  expect(denied.statusCode).toBe(429);
  expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
});
it('vincula ticket a conversa existente e origem autorizada', async () => {
  const app = await setup();
  const created = await app.inject({
    method: 'POST',
    url: '/v1/conversations',
    headers,
    payload: {},
  });
  expect(created.statusCode).toBe(201);
  const { id } = created.json();
  const bad = await app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/call-tickets`,
    headers,
    payload: { origin: 'https://evil.example' },
  });
  expect(bad.statusCode).toBe(403);
  const result = await app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/call-tickets`,
    headers,
    payload: { origin: 'http://localhost:5173' },
  });
  expect(result.statusCode).toBe(201);
  expect(result.json().ticket).toHaveLength(43);
  const missing = await app.inject({
    method: 'POST',
    url: '/v1/conversations/00000000-0000-4000-8000-000000000000/call-tickets',
    headers,
    payload: { origin: 'http://localhost:5173' },
  });
  expect(missing.statusCode).toBe(404);
});
it('OpenAPI descreve segurança, erros e contratos versionados', async () => {
  const app = await setup();
  const spec = (await app.inject({ url: '/v1/openapi.json', headers })).json();

  for (const path of ['/v1/usage', '/v1/providers', '/v1/voice/protocol']) {
    expect(spec.paths[path].get.security).toEqual([{ bearerAuth: [] }]);
  }

  expect(spec.paths['/v1/providers'].put.requestBody).toBeDefined();
  expect(JSON.stringify(spec)).not.toContain(token);
  expect(
    (await app.inject({ url: '/v1/voice/protocol', headers })).json(),
  ).toMatchObject({ stage: 'foundation', voicePipelineImplemented: false });
});
it('não registra credenciais, queries de ticket ou conteúdo pessoal nos logs', async () => {
  const logs: string[] = [];
  const app = await buildApp({
    token,
    logLevel: 'info',
    logStream: { write: (message) => logs.push(message) },
  });
  apps.push(app);
  await app.inject({
    method: 'POST',
    url: '/v1/conversations?ticket=private-ticket',
    headers,
    payload: { personal: 'private-conversation' },
  });
  const output = logs.join('');
  expect(output).toContain('request.completed');

  for (const secret of [token, 'private-ticket', 'private-conversation']) {
    expect(output).not.toContain(secret);
  }
});
