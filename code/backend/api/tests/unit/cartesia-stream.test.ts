import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, expect, it } from 'vitest';
import { cartesiaStreaming } from '../../src/adapters/providers/cartesia-stream.ts';
import { QuotaExceededError } from '../../src/domain/errors/providers.ts';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

async function fixture() {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  cleanup.push(async () => {
    for (const client of server.clients) {
      client.terminate();
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address() as { port: number };
  const id = randomUUID();
  let connections = 0;
  let flushId = 0;
  const requests: Record<string, unknown>[] = [];

  let finish = () => {};

  server.on('connection', (socket, request) => {
    connections++;
    expect(request.headers['x-api-key']).toBe('test-key');
    socket.on('message', (data) => {
      const value = JSON.parse(data.toString());
      requests.push(value);

      if (value.flush) {
        const current = flushId++;
        socket.send(
          JSON.stringify({
            type: 'chunk',
            context_id: value.context_id,
            flush_id: current,
            data: Buffer.alloc(4800).toString('base64'),
            status_code: 206,
          }),
        );

        finish = () => {
          socket.send(
            JSON.stringify({
              type: 'flush_done',
              context_id: value.context_id,
              flush_id: current,
              status_code: 206,
            }),
          );
          socket.send(
            JSON.stringify({
              type: 'flush_done',
              context_id: value.context_id,
              flush_id: flushId++,
              status_code: 206,
            }),
          );
        };
      }
    });
  });
  const adapter = cartesiaStreaming(
    'test-key',
    randomUUID(),
    '2026-08-14',
    () => new QuotaExceededError(),
    (url, options) => {
      expect(url).toContain('cartesia_version=2026-08-14');

      return new WebSocket(`ws://127.0.0.1:${address.port}`, options);
    },
  );
  cleanup.push(() => adapter.closeSpeech(id));
  const input = {
    content: 'Uma frase completa.',
    maxTokens: 1,
    dataClass: 'synthetic' as const,
    speechContextId: id,
  };

  return {
    adapter,
    input,
    requests,
    connections: () => connections,
    finish: () => finish(),
  };
}

it('entrega PCM antes de concluir e continua no mesmo contexto sem reiniciar a conexão', async () => {
  const f = await fixture();

  for (const text of ['Uma frase completa.', 'Agora a continuação.']) {
    const audio = f.adapter.streamAudio({ ...f.input, content: text });
    const stream = audio[Symbol.asyncIterator]();
    const first = await stream.next();
    expect(first.done).toBe(false);
    expect(first.value.audio).toMatchObject({ sampleRate: 24000, channels: 1 });
    expect(first.value.progressiveAudio).toBe(true);
    f.finish();
    expect((await stream.next()).done).toBe(true);
  }

  expect(f.connections()).toBe(1);
  expect(f.requests.filter((r) => r.transcript)).toHaveLength(2);
  expect(
    f.requests.every(
      (r) =>
        r.context_id === f.requests[0]!.context_id &&
        r.continue === true &&
        r.max_buffer_delay_ms === 0,
    ),
  ).toBe(true);
});

it('envia emoção antes da síntese e reporta aplicação apenas com PCM válido', async () => {
  const f = await fixture();
  const speechExpression = {
    intent: 'limitar' as const,
    emotion: 'raiva' as const,
    intensity: 0.8,
  };
  const audio = f.adapter.streamAudio({ ...f.input, speechExpression });
  const stream = audio[Symbol.asyncIterator]();
  expect((await stream.next()).value).toMatchObject({
    speechExpressionApplied: speechExpression,
  });
  expect(f.requests[0]).toMatchObject({
    generation_config: { emotion: 'mad' },
  });
  expect(f.requests[0]).not.toHaveProperty('volume');
  f.finish();
  expect((await stream.next()).done).toBe(true);
});

it('abre outro contexto para um bloco tardio em vez de reutilizar um ID expirado', async () => {
  const f = await fixture();

  for (let index = 0; index < 2; index++) {
    if (index) {
      await new Promise((resolve) => setTimeout(resolve, 650));
    }

    const stream = f.adapter.streamAudio(f.input)[Symbol.asyncIterator]();
    expect((await stream.next()).done).toBe(false);
    f.finish();
    expect((await stream.next()).done).toBe(true);
  }

  const ids = f.requests
    .filter((request) => request.transcript)
    .map((request) => request.context_id);
  expect(new Set(ids).size).toBe(2);
  expect(f.connections()).toBe(2);
});

it('cancelamento após o primeiro chunk impede continuar o áudio', async () => {
  const f = await fixture();
  const abort = new AbortController();
  const audio = f.adapter.streamAudio(f.input, abort.signal);
  const stream = audio[Symbol.asyncIterator]();
  expect((await stream.next()).done).toBe(false);
  abort.abort();
  await expect(stream.next()).rejects.toBeDefined();
});
