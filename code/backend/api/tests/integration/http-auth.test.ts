import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';

const token = 'test-only-token-with-at-least-32-characters';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function setup() {
  const app = await buildApp({ token });
  apps.push(app);

  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('acesso à API', () => {
  it('expõe somente saúde mínima publicamente', async () => {
    const app = await setup();
    expect((await app.inject('/v1/health')).json()).toEqual({
      status: 'ok',
      service: 'amadeus-api',
    });

    for (const url of ['/v1/capabilities', '/v1/openapi.json']) {
      const unauthorized = await app.inject(url);
      expect(unauthorized.statusCode).toBe(401);
      expect(unauthorized.headers['www-authenticate']).toBe(
        'Bearer realm="amadeus"',
      );
      expect(
        (await app.inject({ url, headers: { authorization: 'Bearer wrong' } }))
          .statusCode,
      ).toBe(401);
    }
  });
  it('autentica sem anunciar capacidades ainda não implementadas', async () => {
    const app = await setup();
    const headers = { authorization: `Bearer ${token}` };
    const result = await app.inject({ url: '/v1/capabilities', headers });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      voice: false,
      customVoice: false,
      vision: false,
      memory: false,
      live2d: false,
      desktop: false,
      foundationChannel: true,
      protocolVersion: '1.0',
    });
    expect(result.json().providers).toHaveLength(3);
    expect(
      result
        .json()
        .providers.every((p: { available: boolean }) => !p.available),
    ).toBe(true);
    const spec = (
      await app.inject({ url: '/v1/openapi.json', headers })
    ).json();
    expect(spec.paths['/v1/capabilities'].get.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(JSON.stringify(spec)).not.toContain(token);
  });
});
