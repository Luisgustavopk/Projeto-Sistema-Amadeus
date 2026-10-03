import { expect, it } from 'vitest';
import { decodeClientMessage } from '../../src/realtime/session/decoder.ts';
import { createSessionState } from '../../src/realtime/session/state.ts';

const start = {
  type: 'session.start',
  protocolVersion: '1.0',
  audio: {
    codec: 'pcm_s16le',
    sampleRate: 16000,
    channels: 1,
    frameDurationMs: 20,
  },
} as const;

it('exige negociação antes de ping ou encerramento', () => {
  for (const event of [
    { type: 'ping', id: 'first' } as const,
    { type: 'session.end' } as const,
  ]) {
    expect(createSessionState().accept(event)).toMatchObject({
      event: { type: 'error', code: 'NEGOTIATION_REQUIRED' },
      close: { code: 1008 },
    });
  }
});

it('negocia uma vez, correlaciona ping e encerra a sessão', () => {
  const state = createSessionState();
  expect(state.accept(start)).toMatchObject({
    negotiated: true,
    event: { type: 'session.ready', voiceAvailable: false, audio: start.audio },
  });
  expect(state.accept({ type: 'ping', id: 'correlation-id' })).toEqual({
    event: { type: 'pong', id: 'correlation-id' },
  });
  expect(state.accept({ type: 'session.end' })).toMatchObject({
    event: { type: 'session.closed' },
    close: { code: 1000 },
  });
  const duplicate = createSessionState();
  duplicate.accept(start);
  expect(duplicate.accept(start)).toMatchObject({
    event: { type: 'error', code: 'ALREADY_NEGOTIATED' },
  });
});

it('distingue JSON inválido, versão incompatível e áudio não implementado', () => {
  expect(decodeClientMessage('{', false)).toEqual({
    ok: false,
    code: 'INVALID_JSON',
  });
  expect(
    decodeClientMessage(
      JSON.stringify({ ...start, protocolVersion: '2.0' }),
      false,
    ),
  ).toEqual({ ok: false, code: 'INVALID_EVENT_OR_VERSION' });
  expect(decodeClientMessage('', true)).toEqual({
    ok: false,
    code: 'AUDIO_NOT_IMPLEMENTED',
  });
  expect(decodeClientMessage(JSON.stringify(start), false)).toEqual({
    ok: true,
    event: start,
  });
});
