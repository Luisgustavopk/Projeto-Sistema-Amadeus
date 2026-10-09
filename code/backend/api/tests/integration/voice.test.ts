import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { SqliteCallTicketRepository } from '../../src/adapters/database/call-ticket-repository.ts';

const token = 'test-only-credential-of-more-than-32-characters';
const origin = 'http://localhost:5173';
const headers = { authorization: `Bearer ${token}` };
const sockets: WebSocket[] = [];
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(
    sockets.splice(0).map(async (ws) => {
      if (ws.readyState !== WebSocket.CLOSED) {
        const closed = once(ws, 'close');
        ws.terminate();
        await closed;
      }
    }),
  );
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(extra: NodeJS.ProcessEnv = {}) {
  const database = await openDatabase('file::memory:');
  const store = new SqliteCallTicketRepository(database.client);
  const app = await buildApp({
    token,
    database,
    config: loadConfig({
      API_ACCESS_TOKEN: token,
      ALLOWED_ORIGINS: origin,
      ...extra,
    }),
  });
  apps.push(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const created = (
    await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers,
      payload: {},
    })
  ).json();

  async function ticket() {
    return (
      await app.inject({
        method: 'POST',
        url: `/v1/conversations/${created.id}/call-tickets`,
        headers,
        payload: { origin },
      })
    ).json().ticket as string;
  }

  function connect(
    value: string,
    clientOrigin = origin,
    id = created.id as string,
  ) {
    const ws = new WebSocket(
      `${address.replace('http', 'ws')}/v1/conversations/${id}/call?ticket=${value}`,
      { headers: { origin: clientOrigin } },
    );
    sockets.push(ws);

    return ws;
  }

  return { app, store, id: created.id as string, ticket, connect };
}

const start = {
  type: 'session.start',
  protocolVersion: '1.0',
  audio: {
    codec: 'pcm_s16le',
    sampleRate: 16000,
    channels: 1,
    frameDurationMs: 20,
  },
};

it.each(['1.0', '1.1'])(
  'avisa a sessão %s quando a API encerra para reinicialização',
  async (protocolVersion) => {
    const f = await setup();
    const ws = f.connect(await f.ticket());
    await once(ws, 'open');
    await exchange(ws, { ...start, protocolVersion, dataClass: 'synthetic' });
    const closed = once(ws, 'close');
    await f.app.close();
    const [code, reason] = await closed;
    expect(code).toBe(1012);
    expect(String(reason)).toBe('Service restart');
  },
);

async function exchange(ws: WebSocket, payload: unknown) {
  const result = once(ws, 'message');
  ws.send(JSON.stringify(payload));

  return JSON.parse(String((await result)[0])) as Record<string, unknown>;
}

it('negocia versão e áudio sem anunciar uma chamada implementada', async () => {
  const f = await setup();
  const ws = f.connect(await f.ticket());
  await once(ws, 'open');
  expect(await exchange(ws, start)).toMatchObject({
    type: 'session.ready',
    voiceAvailable: false,
    stage: 'foundation',
  });
  expect(await exchange(ws, { type: 'ping', id: 'p1' })).toEqual({
    type: 'pong',
    id: 'p1',
  });
  expect(await exchange(ws, { type: 'session.end' })).toEqual({
    type: 'session.closed',
  });
});
it('ticket só pode ser usado uma vez, inclusive em conexões concorrentes', async () => {
  const f = await setup();
  const value = await f.ticket();
  const first = f.connect(value);
  await once(first, 'open');
  const second = f.connect(value);
  await expect(once(second, 'open')).rejects.toThrow('401');
});
it('rejeita origem e conversa diferentes sem consumir o ticket correto', async () => {
  const f = await setup();
  const value = await f.ticket();
  const wrong = f.connect(value, 'https://evil.example');
  await expect(once(wrong, 'open')).rejects.toThrow('403');
  const unrelated = f.connect(
    value,
    origin,
    '00000000-0000-4000-8000-000000000000',
  );
  await expect(once(unrelated, 'open')).rejects.toThrow('401');
  const valid = f.connect(value);
  await once(valid, 'open');
  expect(await exchange(valid, start)).toMatchObject({ type: 'session.ready' });
});
it('rejeita tickets expirados e emitidos com uma credencial revogada', async () => {
  const f = await setup();

  for (const [credential, expiresAt] of [
    [token, Date.now() - 1],
    ['old-credential', Date.now() + 30000],
  ] as const) {
    const value = randomBytes(32).toString('base64url');
    await f.store.create({
      ticket: value,
      conversation: f.id,
      owner: 'primary',
      credential,
      origin,
      expiresAt,
    });
    const ws = f.connect(value);
    await expect(once(ws, 'open')).rejects.toThrow('401');
  }
});
it('rejeita versões, eventos extras e áudio binário na fundação', async () => {
  const f = await setup();
  const invalid = f.connect(await f.ticket());
  await once(invalid, 'open');
  expect(
    await exchange(invalid, { ...start, protocolVersion: '2.0' }),
  ).toMatchObject({ type: 'error', code: 'INVALID_EVENT_OR_VERSION' });
  const audio = f.connect(await f.ticket());
  await once(audio, 'open');
  await exchange(audio, start);
  const error = once(audio, 'message');
  audio.send(Buffer.alloc(640));
  expect(JSON.parse(String((await error)[0]))).toMatchObject({
    code: 'AUDIO_NOT_IMPLEMENTED',
  });
});
it('limita conexões simultâneas e rejeita query inválida', async () => {
  const f = await setup({ MAX_CONNECTIONS: '1' });
  const ws = f.connect(await f.ticket());
  await once(ws, 'open');
  const second = f.connect(await f.ticket());
  await expect(once(second, 'open')).rejects.toThrow('429');
  const invalid = await f.app.inject({
    url: `/v1/conversations/${f.id}/call?ticket=invalid`,
    headers: { origin, upgrade: 'websocket' },
  });
  expect(invalid.statusCode).toBe(400);
});
