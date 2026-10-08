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
import { MEMORY_EMBEDDING_DIMENSIONS } from '../../src/domain/memory/embeddings.ts';

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
  options: {
    failTts?: boolean;
    delayLlm?: boolean | number;
    delayStt?: boolean;
    noSpeech?: boolean;
    noVoiceProfile?: boolean;
    llmResponse?: string;
    llmResponses?: string[];
    ttsSampleRate?: 16000 | 24000;
    memoryReview?: boolean;
  } = {},
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

    if (role === 'stt' && options.delayStt) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (role === 'stt' && options.noSpeech) {
      res.statusCode = 422;
      res.end(JSON.stringify({ code: 'NO_SPEECH_DETECTED' }));

      return;
    }

    if (
      role === 'llm' &&
      options.delayLlm &&
      requests.filter((r) => r.role === 'llm').length === 1
    ) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          typeof options.delayLlm === 'number' ? options.delayLlm : 250,
        ),
      );
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
              ? (options.llmResponses?.[
                  requests.filter((r) => r.role === 'llm').length - 1
                ] ??
                options.llmResponse ??
                'Olá. Estou ouvindo.')
              : '',
        inputTokens: 2,
        outputTokens: 3,
        ...(role === 'tts'
          ? {
              audio: {
                pcmBase64: Buffer.alloc(1280).toString('base64'),
                sampleRate: options.ttsSampleRate ?? 16000,
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
    ...(options.memoryReview
      ? {
          personaDecisionClient: {
            decide: async () => ({
              tone: 'neutral' as const,
              confidence: 1,
              inputTokens: 1,
              outputTokens: 0,
              costUsd: 0,
            }),
            reviewMemory: async () => ({
              verdict: 'supported' as const,
              confidence: 1,
              inputTokens: 1,
              outputTokens: 0,
              costUsd: 0,
            }),
          },
        }
      : {}),
    memoryEmbeddings: {
      key: 'test-voice-memory-embedding',
      embed: async (texts) =>
        texts.map(() => [
          1,
          ...Array<number>(MEMORY_EMBEDDING_DIMENSIONS - 1).fill(0),
        ]),
      close: async () => undefined,
    },
    config: loadConfig({
      API_ACCESS_TOKEN: token,
      ALLOWED_ORIGINS: origin,
      VOICE_REFERENCE_DIRECTORY: dir,
      MEMORY_RERANK_ENABLED: 'false',
    }),
  });
  cleanup.push(() => app.close());

  if (options.memoryReview) {
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/persona/analysis',
          headers,
          payload: { revision: 0, configuration: { enabled: true } },
        })
      ).statusCode,
    ).toBe(200);
  }

  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const config = Object.fromEntries(
    ['llm', 'stt', 'tts'].map((role) => [
      role,
      {
        adapter: 'http-json',
        endpoint: base + '/' + role,
        ...(role === 'stt' ? { dataPolicy: 'local-approved' } : {}),
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

  if (!options.noVoiceProfile) {
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
  }

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

it('negocia saudação, preserva continuidade e não extrai evento da aplicação como fala pessoal', async () => {
  const f = await fixture({
    llmResponses: [
      '<expression>{"memory":[],"intent":"conversar","emotion":"calor_discreto","intensity":0.2}</expression>Ah, oi.',
      '<expression>{"memory":[],"intent":"conversar","emotion":"curiosidade","intensity":0.3}</expression>Vamos conversar.',
    ],
  });
  f.send({ type: 'presence.update', enabled: true, available: true });
  await vi.waitFor(
    () => expect(f.events.some((e) => e.type === 'presence.offer')).toBe(true),
    { timeout: 2500 },
  );
  expect(f.requests.filter((r) => r.role === 'llm')).toHaveLength(0);
  const offer = f.events.find((e) => e.type === 'presence.offer')!;
  f.send({ type: 'presence.accept', offerId: offer.offerId, turnId: 1 });
  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 1),
    ).toBe(true),
  );
  const initiative = (
    await f.database.client.execute(
      'SELECT user_text, initiative_kind FROM call_turns',
    )
  ).rows[0]!;
  expect(initiative).toMatchObject({
    user_text: '',
    initiative_kind: 'greeting',
  });
  const history = await createSqliteCallHistory(f.database.client).recent(
    f.id,
    'primary',
    12,
  );
  expect(history[0]).toMatchObject({
    userText: '',
    initiativeKind: 'greeting',
    sentText: 'Ah, oi.',
  });
  expect(f.requests.find((r) => r.role === 'llm')!.content).toContain(
    'Tipo de iniciativa: greeting',
  );
  expect(
    (
      await f.app.inject({
        url: '/v1/persona/state?dataClass=synthetic',
        headers,
      })
    ).json().interactions,
  ).toBe(0);
  f.send({ type: 'text.send', turnId: 2, text: 'Oi, como está?' });
  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 2),
    ).toBe(true),
  );
  const state = (
    await f.app.inject({
      url: '/v1/persona/state?dataClass=synthetic',
      headers,
    })
  ).json();
  expect(state.interactions).toBe(1);
  expect(state).not.toHaveProperty('lastResponseIds');
  expect((await f.app.inject({ url: '/v1/persona/state' })).statusCode).toBe(
    401,
  );
  expect(
    (
      await f.app.inject({
        method: 'DELETE',
        url: '/v1/persona/state?dataClass=synthetic',
        headers,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await f.app.inject({
        url: '/v1/persona/state?dataClass=synthetic',
        headers,
      })
    ).json().interactions,
  ).toBe(0);
});

it('descarta aceite atrasado quando a pessoa já começou um turno', async () => {
  const f = await fixture();
  f.send({ type: 'presence.update', enabled: true, available: true });
  await vi.waitFor(
    () => expect(f.events.some((e) => e.type === 'presence.offer')).toBe(true),
    { timeout: 2500 },
  );
  const offer = f.events.find((e) => e.type === 'presence.offer')!;
  f.send({
    type: 'text.send',
    turnId: 1,
    text: 'Minha pergunta tem prioridade.',
  });
  f.send({ type: 'presence.accept', offerId: offer.offerId, turnId: 2 });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  expect(f.requests.filter((r) => r.role === 'llm')).toHaveLength(1);
  expect(
    f.events.some(
      (e) => e.type === 'error' && e.code === 'INVALID_VOICE_EVENT',
    ),
  ).toBe(false);
});

it('recupera fatos confirmados entre conversas sem incluir memória local na nuvem', async () => {
  const f = await fixture({ memoryReview: true });
  const created = await f.app.inject({
    method: 'POST',
    url: '/v1/facts',
    headers,
    payload: {
      text: 'O clone aprovado está na Cartesia.',
      category: 'projeto',
      dataClass: 'synthetic',
      permission: 'eligible',
    },
  });
  expect(created.statusCode).toBe(201);
  await f.app.inject({
    method: 'POST',
    url: '/v1/facts',
    headers,
    payload: {
      text: 'Cartesia: dado reservado localmente.',
      category: 'projeto',
      dataClass: 'synthetic',
      permission: 'local-only',
    },
  });
  f.send({
    type: 'text.send',
    turnId: 1,
    text: 'Qual clone está na Cartesia?',
  });
  await vi.waitFor(
    () =>
      expect(
        f.events.some((event) => event.type === 'reply.done'),
        JSON.stringify(f.events),
      ).toBe(true),
    { timeout: 3000 },
  );
  const request = f.requests.find((request) => request.role === 'llm')!.content;
  expect(request).toContain('O clone aprovado está na Cartesia.');
  expect(request).not.toContain('dado reservado localmente');
  expect(request).toContain('Neste turno há fatos autorizados no contexto');
  const generations = f.requests.filter((request) => request.role === 'llm');
  expect(generations).toHaveLength(1);
});

it('distingue falta de memória recuperada da ausência de memória persistente', async () => {
  const f = await fixture();
  f.send({ type: 'text.send', turnId: 1, text: 'Como eu gosto do meu café?' });
  await vi.waitFor(() =>
    expect(f.events.some((event) => event.type === 'reply.done')).toBe(true),
  );
  const request = f.requests.find((request) => request.role === 'llm')!;
  expect(request.content).not.toContain('Memória persistente selecionada');
  expect(request.content).toContain(
    'Neste turno não há fatos persistentes selecionados',
  );
  expect(request.content).toContain(
    'lembranças relevantes que o aplicativo fornecer',
  );
});

it('retoma contexto com ticket novo sem repetir áudio ou fala interrompida', async () => {
  const f = await fixture({
    llmResponses: [
      'Resposta anterior parcialmente ouvida.',
      'Podemos continuar.',
    ],
  });
  f.send({
    type: 'text.send',
    turnId: 1,
    text: 'Minha hipótese sintética anterior.',
  });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  const segment = f.events.find((e) => e.type === 'audio.segment')!;
  f.send({
    type: 'playback.progress',
    responseId: segment.responseId,
    segmentId: segment.segmentId,
    playedSamples: 10,
  });
  await vi.waitFor(async () =>
    expect(
      (
        await f.database.client.execute({
          sql: 'SELECT played_samples FROM speech_segments WHERE id = ?',
          args: [String(segment.segmentId)],
        })
      ).rows[0]!.played_samples,
    ).toBe(10),
  );
  const previousSessionId = String(
    f.events.find((e) => e.type === 'session.ready')!.sessionId,
  );
  const oldClosed = once(f.ws, 'close');
  f.ws.terminate();
  await oldClosed;
  const { ticket } = (
    await f.app.inject({
      method: 'POST',
      url: `/v1/conversations/${f.id}/call-tickets`,
      headers,
      payload: { origin },
    })
  ).json();
  const ws = new WebSocket(
    `ws://127.0.0.1:${(f.app.server.address() as { port: number }).port}/v1/conversations/${f.id}/call?ticket=${ticket}`,
    { headers: { origin } },
  );
  cleanup.push(async () => {
    if (ws.readyState !== WebSocket.CLOSED) {
      const closing = once(ws, 'close');
      ws.terminate();
      await closing;
    }
  });
  const events: Record<string, unknown>[] = [];
  const frames: Buffer[] = [];
  ws.on('message', (data, binary) => {
    if (binary) {
      frames.push(Buffer.from(data as Buffer));
    } else {
      events.push(JSON.parse(String(data)));
    }
  });
  await once(ws, 'open');
  ws.send(
    JSON.stringify({
      type: 'session.resume',
      protocolVersion: '1.1',
      previousSessionId,
      lastSeq: 4,
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
  expect(events.find((e) => e.type === 'session.ready')).toMatchObject({
    resumedFrom: previousSessionId,
    replayedAudio: false,
  });
  expect(events.find((e) => e.type === 'session.ready')!.sessionId).not.toBe(
    previousSessionId,
  );
  expect(frames).toHaveLength(0);
  expect(f.requests.filter((r) => r.role === 'llm')).toHaveLength(1);
  ws.send(
    JSON.stringify({
      type: 'text.send',
      turnId: 1,
      text: 'Vamos retomar a hipótese.',
    }),
  );
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  const content = f.requests.filter((r) => r.role === 'llm')[1]!.content;
  expect(content).toContain('Minha hipótese sintética anterior.');
  expect(content).toContain('"partiallyPlayed":true');
  expect(content).toContain('Resposta anterior parcialmente ouvida.');
  expect(content).toContain('texto enviado não comprova leitura nem audição');
  expect(
    (await f.database.client.execute('SELECT * FROM memory_resumptions')).rows,
  ).toHaveLength(1);
});

it.each([16000, 24000] as const)(
  'expressão e áudio de %i Hz acompanham cada segmento sem alterar o payload de síntese',
  async (sampleRate) => {
    const f = await fixture({
      ttsSampleRate: sampleRate,
      llmResponse:
        '<expression>{"intent":"explorar","emotion":"curiosidade","intensity":0.4}</expression>Vamos testar. A hipótese é interessante.',
    });
    f.send({ type: 'text.send', turnId: 1, text: 'Uma hipótese sintética.' });
    await vi.waitFor(() =>
      expect(f.events.some((event) => event.type === 'reply.done')).toBe(true),
    );
    const directions = f.events.filter(
      (event) => event.type === 'reply.expression',
    );
    const texts = f.events.filter((event) => event.type === 'reply.text');
    expect(f.requests.filter((request) => request.role === 'tts')).toHaveLength(
      1,
    );
    expect(texts.map((event) => event.text)).toEqual([
      'Vamos testar. A hipótese é interessante.',
    ]);
    expect(
      f.events
        .filter((event) => event.type === 'audio.segment')
        .every((event) => event.sampleRate === sampleRate),
    ).toBe(true);
    expect(f.frames.length).toBeGreaterThan(0);
    expect(
      f.frames.every((frame) => frame.length === 8 + (sampleRate / 50) * 2),
    ).toBe(true);
    expect(directions.length).toBe(texts.length);
    expect(directions.length).toBeGreaterThan(0);
    expect(directions[0]).toMatchObject({
      emotion: 'curiosidade',
      intensity: 0.35,
      metadataValid: true,
      deliveryApplied: false,
      personaVersion: 'kurisu-amadeus-0.4.20',
    });
    expect(f.requests.filter((request) => request.role === 'llm')).toHaveLength(
      1,
    );
    expect(
      f.requests
        .filter((request) => request.role === 'tts')
        .map((request) => request.content)
        .join(' '),
    ).toBe(texts.map((event) => event.text).join(' '));
    expect(
      f.requests
        .filter((request) => request.role === 'tts')
        .every((request) => !request.content.includes('expression')),
    ).toBe(true);
    expect(
      directions.every((event) =>
        texts.some(
          (text) =>
            text.segmentId === event.segmentId &&
            text.responseId === event.responseId,
        ),
      ),
    ).toBe(true);
  },
);

it('aplica uma edição de persona no próximo turno da mesma conexão', async () => {
  const f = await fixture();
  f.send({ type: 'text.send', turnId: 1, text: 'Primeiro turno.' });
  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 1),
    ).toBe(true),
  );
  const before = f.requests.find((r) => r.role === 'llm')!.content;
  const edit = await f.app.inject({
    method: 'PUT',
    url: '/v1/persona',
    headers,
    payload: {
      expectedRevision: 0,
      direction: 'Prefira analogias de astronomia quando forem úteis.',
    },
  });
  expect(edit.statusCode).toBe(200);
  f.send({ type: 'text.send', turnId: 2, text: 'Segundo turno.' });
  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 2),
    ).toBe(true),
  );
  const after = f.requests.filter((r) => r.role === 'llm')[1]!.content;
  expect(before).not.toContain('analogias de astronomia');
  expect(after).toContain('analogias de astronomia');
  expect(after).toContain('FORMATO OBRIGAT');
});

it('reconectar reinicia a expressão mesmo quando a chamada anterior já acumulou intensidade', async () => {
  const f = await fixture({
    llmResponse:
      '<expression>{"intent":"explorar","emotion":"curiosidade","intensity":0.7}</expression>Vamos testar.',
  });
  f.send({ type: 'text.send', turnId: 1, text: 'Hipótese inicial.' });
  await vi.waitFor(() =>
    expect(
      f.events.some(
        (event) => event.type === 'reply.done' && event.turnId === 1,
      ),
    ).toBe(true),
  );
  f.send({ type: 'text.send', turnId: 2, text: 'Mais uma hipótese.' });
  await vi.waitFor(() =>
    expect(
      f.events.some(
        (event) => event.type === 'reply.done' && event.turnId === 2,
      ),
    ).toBe(true),
  );
  expect(
    f.events.find(
      (event) => event.type === 'reply.expression' && event.turnId === 2,
    )?.intensity,
  ).toBe(0.55);
  const { ticket } = (
    await f.app.inject({
      method: 'POST',
      url: `/v1/conversations/${f.id}/call-tickets`,
      headers,
      payload: { origin },
    })
  ).json() as { ticket: string };
  const replacement = new WebSocket(
    `ws://127.0.0.1:${(f.app.server.address() as { port: number }).port}/v1/conversations/${f.id}/call?ticket=${ticket}`,
    { headers: { origin } },
  );
  cleanup.push(async () => {
    if (replacement.readyState !== WebSocket.CLOSED) {
      const closed = once(replacement, 'close');
      replacement.terminate();
      await closed;
    }
  });
  const events: Record<string, unknown>[] = [];
  replacement.on('message', (data, binary) => {
    if (!binary) {
      events.push(JSON.parse(String(data)) as Record<string, unknown>);
    }
  });
  await once(replacement, 'open');
  replacement.send(
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
    expect(events.some((event) => event.type === 'session.ready')).toBe(true),
  );
  replacement.send(
    JSON.stringify({
      type: 'text.send',
      turnId: 1,
      text: 'Primeira hipótese da nova chamada.',
    }),
  );
  await vi.waitFor(() =>
    expect(events.some((event) => event.type === 'reply.done')).toBe(true),
  );
  expect(
    events.find((event) => event.type === 'reply.expression')?.intensity,
  ).toBe(0.35);
});

it('uma palavra reconhecida cancela a resposta antes do fim da nova captura', async () => {
  const f = await fixture({ delayLlm: 1000 });
  f.send({ type: 'text.send', turnId: 1, text: 'Resposta sintética anterior' });
  await vi.waitFor(() =>
    expect(f.requests.some((r) => r.role === 'llm')).toBe(true),
  );
  f.send({ type: 'speech.start', turnId: 2 });

  for (let sequence = 0; sequence < 40; sequence++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(sequence, 0);
    frame.writeUInt32LE(2, 4);
    f.ws.send(frame);
  }

  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'transcript.partial' && e.turnId === 2),
    ).toBe(true),
  );
  expect(f.events.some((e) => e.type === 'interrupted' && e.turnId === 1)).toBe(
    true,
  );
  expect(f.events.some((e) => e.type === 'transcript.final')).toBe(false);
  expect(f.requests.filter((r) => r.role === 'llm')).toHaveLength(1);
  f.send({ type: 'speech.end', turnId: 2 });
  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 2),
    ).toBe(true),
  );
  expect(f.requests.filter((r) => r.role === 'llm')).toHaveLength(2);
});

it('ruído durante captura não interrompe a resposta nem inicia outra geração', async () => {
  const f = await fixture({ noSpeech: true, delayLlm: 250 });
  f.send({ type: 'text.send', turnId: 1, text: 'Resposta sintética anterior' });
  await vi.waitFor(() =>
    expect(f.requests.some((r) => r.role === 'llm')).toBe(true),
  );
  f.send({ type: 'speech.start', turnId: 2 });

  for (let sequence = 0; sequence < 40; sequence++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(sequence, 0);
    frame.writeUInt32LE(2, 4);
    f.ws.send(frame);
  }

  await vi.waitFor(() =>
    expect(
      f.events.some((e) => e.type === 'reply.done' && e.turnId === 1),
    ).toBe(true),
  );
  expect(f.requests.some((r) => r.role === 'stt')).toBe(true);
  expect(
    f.events.some(
      (e) => e.type === 'transcript.partial' || e.type === 'interrupted',
    ),
  ).toBe(false);
  expect(f.frames.length).toBeGreaterThan(0);
  f.send({ type: 'speech.end', turnId: 2 });
  await vi.waitFor(() =>
    expect(
      f.events.some(
        (e) => e.type === 'error' && e.code === 'NO_SPEECH_DETECTED',
      ),
    ).toBe(true),
  );
  expect(f.events.some((e) => e.type === 'interrupted')).toBe(false);
  expect(f.requests.filter((r) => r.role === 'llm')).toHaveLength(1);
});

it('substitui a chamada anterior do mesmo usuário antes de liberar outra voz', async () => {
  const f = await fixture({ delayLlm: 1000 });
  f.send({ type: 'text.send', turnId: 1, text: 'Fala sintética anterior' });
  await vi.waitFor(() =>
    expect(f.requests.some((request) => request.role === 'llm')).toBe(true),
  );
  const previousClosed = once(f.ws, 'close');
  const { id } = (
    await f.app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers,
      payload: {},
    })
  ).json() as { id: string };
  const { ticket } = (
    await f.app.inject({
      method: 'POST',
      url: `/v1/conversations/${id}/call-tickets`,
      headers,
      payload: { origin },
    })
  ).json() as { ticket: string };
  const address = f.app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('No address');
  }

  const replacement = new WebSocket(
    `ws://127.0.0.1:${address.port}/v1/conversations/${id}/call?ticket=${ticket}`,
    { headers: { origin } },
  );
  cleanup.push(async () => {
    replacement.terminate();
  });
  const events: Record<string, unknown>[] = [];
  replacement.on('message', (data, binary) => {
    if (!binary) {
      events.push(JSON.parse(String(data)) as Record<string, unknown>);
    }
  });
  await once(replacement, 'open');
  replacement.send(
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
    expect(events.some((event) => event.type === 'session.ready')).toBe(true),
  );
  expect(f.ws.readyState).toBe(WebSocket.CLOSED);
  const [code, reason] = await previousClosed;
  expect(code).toBe(4001);
  expect(String(reason)).toBe('Voice session replaced');
  const result = await f.database.client.execute(
    'SELECT COUNT(*) AS count FROM call_sessions WHERE ended_at IS NULL',
  );
  expect(result.rows[0]?.count).toBe(1);
  replacement.send(
    JSON.stringify({
      type: 'text.send',
      turnId: 1,
      text: 'Fala sintética atual',
    }),
  );
  await vi.waitFor(() =>
    expect(events.some((event) => event.type === 'reply.done')).toBe(true),
  );
  expect(f.frames).toHaveLength(0);
  expect(events.some((event) => event.type === 'audio.segment')).toBe(true);
});

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
  const metricResponse = await f.app.inject({ url: '/v1/metrics', headers });
  expect(metricResponse.json().voice.stages).toMatchObject({
    stt: { samples: 1 },
    llmFirstToken: { samples: 1 },
    llmFirstSpeechSegment: { samples: 1 },
    tts: { samples: 1 },
    audioDelivery: { samples: 1 },
  });
  expect(f.requests.map((r) => r.role)).toEqual(['stt', 'llm', 'tts']);
  expect(
    f.requests.find((request) => request.role === 'llm')?.content,
  ).toContain('Medições acústicas, sem inferência emocional');
  expect(f.frames).toHaveLength(2);
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
  await vi.waitFor(async () =>
    expect(
      (
        await f.database.client.execute(
          'SELECT SUM(played_samples) AS played FROM speech_segments',
        )
      ).rows[0]?.played,
    ).toBe(640),
  );
  const history = createSqliteCallHistory(f.database.client);
  expect(await history.recent(f.id, 'primary', 6)).toEqual([
    {
      userText: 'Olá, Amadeus.',
      generatedText: 'Olá. Estou ouvindo.',
      sentText: 'Olá. Estou ouvindo.',
      dataClass: 'synthetic',
      responseStatus: 'completed',
      partiallyPlayed: false,
    },
  ]);
  await f.database.client.execute({
    sql: "UPDATE call_turns SET status = 'interrupted' WHERE response_id = ?",
    args: [String(meta.responseId)],
  });
  await f.database.client.execute({
    sql: 'UPDATE speech_segments SET played_samples = 320 WHERE id = ?',
    args: [String(meta.segmentId)],
  });
  expect(await history.recent(f.id, 'primary', 6)).toEqual([
    {
      userText: 'Olá, Amadeus.',
      generatedText: '',
      sentText: 'Olá. Estou ouvindo.',
      dataClass: 'synthetic',
      responseStatus: 'interrupted',
      partiallyPlayed: true,
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
  expect(
    f.events.find((e) => e.code === 'TTS_UNAVAILABLE_TEXT_AVAILABLE')?.turnId,
  ).toBe(1);
  expect(f.events.some((e) => e.type === 'reply.text')).toBe(true);
  expect(f.frames).toHaveLength(0);
});
it('avisa que a resposta ficará sem áudio quando não há perfil de voz ativo', async () => {
  const f = await fixture({ noVoiceProfile: true });
  f.send({ type: 'text.send', turnId: 1, text: 'teste' });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  expect(f.events.some((e) => e.type === 'reply.text')).toBe(true);
  expect(f.events.some((e) => e.code === 'VOICE_NOT_READY')).toBe(true);
  expect(f.events.some((e) => e.type === 'audio.segment')).toBe(false);
  expect(
    (await f.app.inject({ url: '/v1/metrics', headers })).json().voice,
  ).toMatchObject({ failureReasons: { VOICE_NOT_READY: 1 }, textFallbacks: 1 });
});
it('informa fala não reconhecida e volta ao estado ocioso sem chamar o LLM', async () => {
  const f = await fixture({ noSpeech: true });
  f.send({ type: 'speech.start', turnId: 1 });

  for (let index = 0; index < 5; index++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(index, 0);
    frame.writeUInt32LE(1, 4);
    f.ws.send(frame);
  }

  f.send({ type: 'speech.end', turnId: 1 });
  await vi.waitFor(() => {
    expect(f.events.some((e) => e.code === 'NO_SPEECH_DETECTED')).toBe(true);
    expect(
      f.events.some(
        (e) => e.type === 'state' && e.turnId === 1 && e.state === 'idle',
      ),
    ).toBe(true);
  });
  expect(f.requests.map((request) => request.role)).toEqual(['stt']);
  expect(
    (await f.app.inject({ url: '/v1/metrics', headers })).json().voice,
  ).toMatchObject({
    noSpeech: 1,
    failureReasons: { NO_SPEECH_DETECTED: 1 },
    stages: { stt: { samples: 1 } },
  });
});
it('mantém a resposta em andamento quando o áudio capturado não produz transcrição', async () => {
  const f = await fixture({
    delayLlm: 1000,
    delayStt: true,
    noSpeech: true,
  });
  f.send({ type: 'text.send', turnId: 1, text: 'resposta em andamento' });
  await vi.waitFor(() =>
    expect(f.requests.some((request) => request.role === 'llm')).toBe(true),
  );
  f.send({ type: 'speech.start', turnId: 2 });
  expect(
    f.events.some(
      (event) => event.type === 'interrupted' && event.turnId === 1,
    ),
  ).toBe(false);

  for (let index = 0; index < 5; index++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(index, 0);
    frame.writeUInt32LE(2, 4);
    f.ws.send(frame);
  }

  f.send({ type: 'speech.end', turnId: 2 });
  await vi.waitFor(() =>
    expect(f.events.some((event) => event.code === 'NO_SPEECH_DETECTED')).toBe(
      true,
    ),
  );
  expect(
    f.events.some(
      (event) => event.type === 'interrupted' && event.turnId === 1,
    ),
  ).toBe(false);
  await vi.waitFor(() =>
    expect(
      f.events.some(
        (event) => event.type === 'reply.done' && event.turnId === 1,
      ),
    ).toBe(true),
  );
  expect(f.requests.filter((request) => request.role === 'llm')).toHaveLength(
    1,
  );
});

it('interrompe a resposta anterior somente após STT confirmar uma transcrição', async () => {
  const f = await fixture({ delayLlm: 1000 });
  f.send({ type: 'text.send', turnId: 1, text: 'resposta em andamento' });
  await vi.waitFor(() =>
    expect(f.requests.some((request) => request.role === 'llm')).toBe(true),
  );
  f.send({ type: 'speech.start', turnId: 2 });

  for (let index = 0; index < 5; index++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(index, 0);
    frame.writeUInt32LE(2, 4);
    f.ws.send(frame);
  }

  f.send({ type: 'speech.end', turnId: 2 });

  await vi.waitFor(() =>
    expect(
      f.events.some(
        (event) => event.type === 'reply.done' && event.turnId === 2,
      ),
    ).toBe(true),
  );
  const transcriptIndex = f.events.findIndex(
    (event) => event.type === 'transcript.final' && event.turnId === 2,
  );
  const interruptionIndex = f.events.findIndex(
    (event) => event.type === 'interrupted' && event.turnId === 1,
  );
  expect(transcriptIndex).toBeGreaterThanOrEqual(0);
  expect(interruptionIndex).toBeGreaterThan(transcriptIndex);
  expect(f.requests.filter((request) => request.role === 'llm')).toHaveLength(
    2,
  );
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

it('recupera cabeçalho incompleto antes da fala, sem duplicar áudio ou reiniciar a chamada', async () => {
  const f = await fixture({
    llmResponses: ['<expression>{"intent":"conversar"}', 'Olá. Estou ouvindo.'],
  });
  f.send({ type: 'text.send', turnId: 1, text: 'Olá.' });
  await vi.waitFor(() =>
    expect(f.events.some((e) => e.type === 'reply.done')).toBe(true),
  );
  const attempts = f.requests.filter((r) => r.role === 'llm');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]?.content).toContain(
    'esta é uma reparação única de formato',
  );
  expect(attempts[1]?.content).toContain(
    '<expression>{"memory":{"use":"none","facts":[]}}</expression>',
  );
  expect(attempts[1]?.content).toContain('reparação única de formato');
  expect(f.events.filter((e) => e.type === 'reply.start')).toHaveLength(1);
  expect(f.events.filter((e) => e.type === 'error')).toHaveLength(0);
  expect(
    f.requests.filter((r) => r.role === 'tts').map((r) => r.content),
  ).toEqual(['Olá. Estou ouvindo.']);
  expect(
    f.events
      .filter((e) => e.type === 'reply.expression')
      .every((e) => e.metadataValid === false),
  ).toBe(true);
});
