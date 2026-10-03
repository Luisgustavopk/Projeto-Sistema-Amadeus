import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createSqliteCallHistory } from '../../src/adapters/database/call-history-repository.ts';

const token = 'test-only-credential-of-more-than-32-characters';
const origin = 'http://localhost:5173';
const headers = { authorization: 'Bearer ' + token };
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) {
    await dispose();
  }
});

function wav() {
  const out = Buffer.alloc(44 + 96000);
  out.write('RIFF');
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(16000, 24);
  out.writeUInt32LE(32000, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(96000, 40);

  return out;
}

async function fixture(
  options: { failTts?: boolean; delayLlm?: boolean } = {},
) {
  const requests: { role: string; content: string }[] = [];
  const server = createServer(async (req, res) => {
    const role = req.url?.split('/')[1] ?? '';
    res.setHeader('content-type', 'application/json');

    if (req.url?.endsWith('/health')) {
      res.end(
        JSON.stringify({
          protocolVersion: '1.0',
          role,
          status: 'ok',
          capabilities: {
            incrementalGeneration: false,
            progressiveDelivery: false,
            vision: false,
            customVoice: role === 'tts',
            testedVoiceControls: [],
          },
        }),
      );

      return;
    }

    let body = '';

    for await (const chunk of req) {
      body += chunk;
    }

    const value = JSON.parse(body) as {
      content: string;
      audio?: unknown;
      voice?: unknown;
    };
    requests.push({ role, content: value.content });

    if (
      role === 'llm' &&
      options.delayLlm &&
      requests.filter((r) => r.role === 'llm').length === 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (role === 'tts' && options.failTts) {
      res.statusCode = 503;
      res.end('{}');

      return;
    }

    res.end(
      JSON.stringify({
        content:
          role === 'stt'
            ? 'Olá, Amadeus.'
            : role === 'llm'
              ? 'Olá. Estou ouvindo.'
              : '',
        inputTokens: 2,
        outputTokens: 3,
        ...(role === 'tts'
          ? {
              audio: {
                pcmBase64: Buffer.alloc(1280).toString('base64'),
                sampleRate: 16000,
                channels: 1,
              },
            }
          : {}),
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanup.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error();
  }

  const base = 'http://127.0.0.1:' + address.port;
  const dir = await mkdtemp(join(tmpdir(), 'amadeus-voice-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'reference.wav'), wav());
  const database = await openDatabase('file::memory:');
  const app = await buildApp({
    token,
    database,
    config: loadConfig({
      API_ACCESS_TOKEN: token,
      ALLOWED_ORIGINS: origin,
      VOICE_REFERENCE_DIRECTORY: dir,
    }),
  });
  cleanup.push(() => app.close());
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const config = Object.fromEntries(
    ['llm', 'stt', 'tts'].map((role) => [
      role,
      {
        adapter: 'http-json',
        endpoint: base + '/' + role,
        limits: { requestsPerDay: 1000, tokensPerDay: 10000000 },
      },
    ]),
  );
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/v1/providers',
        headers,
        payload: config,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/v1/voice/profile',
        headers,
        payload: {
          name: 'Referência sintética de teste',
          referenceFile: 'reference.wav',
          consentConfirmed: true,
        },
      })
    ).statusCode,
  ).toBe(200);
  const { id } = (
    await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers,
      payload: {},
    })
  ).json() as { id: string };
  const { ticket } = (
    await app.inject({
      method: 'POST',
      url: '/v1/conversations/' + id + '/call-tickets',
      headers,
      payload: { origin },
    })
  ).json() as { ticket: string };
  const ws = new WebSocket(
    url.replace('http', 'ws') +
      '/v1/conversations/' +
      id +
      '/call?ticket=' +
      ticket,
    { headers: { origin } },
  );
  cleanup.push(async () => {
    if (ws.readyState !== WebSocket.CLOSED) {
      const closed = once(ws, 'close');
      ws.terminate();
      await closed;
    }
  });
  const events: Record<string, unknown>[] = [];
  const frames: Buffer[] = [];
  ws.on('message', (data, binary) => {
    if (binary) {
      frames.push(Buffer.from(data as Buffer));
    } else {
      events.push(JSON.parse(String(data)) as Record<string, unknown>);
    }
  });
  await once(ws, 'open');
  ws.send(
    JSON.stringify({
      type: 'session.start',
      protocolVersion: '1.1',
      dataClass: 'synthetic',
      audio: {
        codec: 'pcm_s16le',
        sampleRate: 16000,
        channels: 1,
        frameDurationMs: 20,
      },
    }),
  );
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'session.ready')).toBe(true),
  );

  return {
    app,
    database,
    ws,
    events,
    frames,
    id,
    requests,
    config,
    send: (value: unknown) => ws.send(JSON.stringify(value)),
  };
}

it('percorre PCM → STT → LLM → voz personalizada e persiste reprodução confirmada', async () => {
  const f = await fixture();
  expect(
    (await f.app.inject({ url: '/v1/capabilities', headers })).json(),
  ).toMatchObject({
    voice: true,
    customVoice: true,
    voiceProtocolVersion: '1.1',
  });
  f.send({ type: 'speech.start', turnId: 1 });

  for (let index = 0; index < 5; index++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(index, 0);
    frame.writeUInt32LE(1, 4);
    f.ws.send(frame);
  }

  f.send({ type: 'speech.end', turnId: 1 });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  expect(f.requests.map((r) => r.role)).toEqual(['stt', 'llm', 'tts', 'tts']);
  expect(f.frames).toHaveLength(4);
  expect(f.frames[0]?.readUInt32LE(0)).toBe(0);
  expect(f.frames[1]?.readUInt32LE(0)).toBe(1);
  const meta = f.events.find((e) => e.type === 'audio.segment')!;
  f.send({
    type: 'playback.progress',
    responseId: meta.responseId,
    segmentId: meta.segmentId,
    playedSamples: 640,
  });
  await vi.waitFor(async () => {
    const result = await f.database.client.execute(
      'SELECT played_samples FROM speech_segments',
    );
    expect(result.rows[0]?.played_samples).toBe(640);
  });
  const other = f.events.filter((e) => e.type === 'audio.segment')[1]!;
  f.send({
    type: 'playback.progress',
    responseId: other.responseId,
    segmentId: other.segmentId,
    playedSamples: 640,
  });
  await vi.waitFor(async () =>
    expect(
      (
        await f.database.client.execute(
          'SELECT SUM(played_samples) AS played FROM speech_segments',
        )
      ).rows[0]?.played,
    ).toBe(1280),
  );
  const history = createSqliteCallHistory(f.database.client);
  expect(await history.recent(f.id, 'primary', 6)).toEqual([
    {
      userText: 'Olá, Amadeus.',
      generatedText: 'Olá. Estou ouvindo.',
      dataClass: 'synthetic',
    },
  ]);
  const close = once(f.ws, 'close');
  f.send({ type: 'session.end' });
  await close;
  const pending = await f.database.client.execute(
    'SELECT status FROM memory_work_pending',
  );
  expect(pending.rows[0]?.status).toBe('pending');
});
it('cancela geração atrasada e não entrega áudio de um turno antigo', async () => {
  const f = await fixture({ delayLlm: true });
  f.send({ type: 'text.send', turnId: 1, text: 'primeiro' });
  await vi.waitFor(() =>
    expect(f.requests.some((r) => r.role === 'llm')).toBe(true),
  );
  const response = await f.database.client.execute(
    'SELECT response_id FROM call_turns WHERE client_turn_id = 1',
  );
  f.send({
    type: 'playback.ended',
    responseId: String(response.rows[0]?.response_id),
  });
  f.send({ type: 'text.send', turnId: 2, text: 'segundo' });
  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 2),
    ).toBe(true),
  );
  expect(f.events.some((e) => e.type === 'reply.text' && e.turnId === 1)).toBe(
    false,
  );
  expect(f.frames.every((frame) => frame.readUInt32LE(4) === 2)).toBe(true);
  expect(f.events.some((e) => e.type === 'interrupted' && e.turnId === 1)).toBe(
    true,
  );
});
it('mantém texto quando o TTS falha', async () => {
  const f = await fixture({ failTts: true });
  f.send({ type: 'text.send', turnId: 1, text: 'teste' });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  expect(
    f.events.some((e) => e.code === 'TTS_UNAVAILABLE_TEXT_AVAILABLE'),
  ).toBe(true);
  expect(f.events.some((e) => e.type === 'reply.text')).toBe(true);
  expect(f.frames).toHaveLength(0);
});
it('rejeita captura repetida e não dispara inferência', async () => {
  const f = await fixture();
  const closed = once(f.ws, 'close');
  f.send({ type: 'speech.start', turnId: 1 });
  f.send({ type: 'speech.start', turnId: 1 });
  await closed;
  expect(f.requests).toHaveLength(0);
});
it('rejeita confirmação que excede a duração ou pertence a outra sessão', async () => {
  const f = await fixture();
  f.send({ type: 'text.send', turnId: 1, text: 'teste' });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  const meta = f.events.find((e) => e.type === 'audio.segment')!;
  const history = createSqliteCallHistory(f.database.client);
  expect(
    await history.acknowledge({
      sessionId: randomUUID(),
      responseId: String(meta.responseId),
      segmentId: String(meta.segmentId),
      playedSamples: 10,
    }),
  ).toBe(false);
  const closed = once(f.ws, 'close');
  f.send({
    type: 'playback.progress',
    responseId: meta.responseId,
    segmentId: meta.segmentId,
    playedSamples: 1000,
  });
  await closed;
});
it('bloqueia travessia de diretório e ausência de autorização da referência', async () => {
  const f = await fixture();

  for (const body of [
    { name: 'x', referenceFile: '../reference.wav', consentConfirmed: true },
    { name: 'x', referenceFile: 'reference.wav', consentConfirmed: false },
  ]) {
    expect(
      (
        await f.app.inject({
          method: 'PUT',
          url: '/v1/voice/profile',
          headers,
          payload: body,
        })
      ).statusCode,
    ).toBe(400);
  }
});
it('preserva a classificação pessoal padrão e bloqueia envio não aprovado', async () => {
  const f = await fixture();
  f.send({ type: 'session.end' });
  await once(f.ws, 'close');
  const { ticket } = (
    await f.app.inject({
      method: 'POST',
      url: '/v1/conversations/' + f.id + '/call-tickets',
      headers,
      payload: { origin },
    })
  ).json() as { ticket: string };
  const address = f.app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error();
  }

  const ws = new WebSocket(
    'ws://127.0.0.1:' +
      address.port +
      '/v1/conversations/' +
      f.id +
      '/call?ticket=' +
      ticket,
    { headers: { origin } },
  );
  cleanup.push(async () => {
    ws.terminate();
  });
  const events: Record<string, unknown>[] = [];
  ws.on('message', (data) =>
    events.push(JSON.parse(String(data)) as Record<string, unknown>),
  );
  await once(ws, 'open');
  ws.send(
    JSON.stringify({
      type: 'session.start',
      protocolVersion: '1.1',
      audio: {
        codec: 'pcm_s16le',
        sampleRate: 16000,
        channels: 1,
        frameDurationMs: 20,
      },
    }),
  );
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'session.ready')).toBe(true),
  );
  ws.send(JSON.stringify({ type: 'text.send', turnId: 1, text: 'pessoal' }));
  await vi.waitFor(() =>
    expect(events.some((e) => e.code === 'DATA_POLICY_BLOCKED')).toBe(true),
  );
  expect(f.requests).toHaveLength(0);
});
