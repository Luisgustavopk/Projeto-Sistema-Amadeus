import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { createVoiceTransport } from '../../src/realtime/session/voice-transport.ts';

it('envia PCM antes do fim e informa tamanho real antes da cauda com padding', async () => {
  const messages: (string | Buffer)[] = [];

  let received = () => {};

  const first = new Promise<void>((resolve) => {
    received = resolve;
  });
  const socket = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(value: string | Buffer, options?: unknown, callback?: () => void) {
      messages.push(value);
      callback?.();

      if (messages.filter((message) => Buffer.isBuffer(message)).length === 5) {
        received();
      }
    },
  } as unknown as WebSocket;
  const transport = createVoiceTransport(socket, randomUUID());

  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const responseId = randomUUID(),
    segmentId = randomUUID();
  const delivery = transport.audioStream!({
    turnId: 1,
    responseId,
    segmentId,
    sampleRate: 24000,
    signal: new AbortController().signal,
    chunks: (async function* () {
      yield Buffer.alloc(4800, 1);
      await pending;
      yield Buffer.alloc(200, 1);
    })(),
  });
  await first;
  expect(JSON.parse(messages[0] as string).type).toBe('audio.start');
  expect(messages.filter((message) => Buffer.isBuffer(message))).toHaveLength(
    5,
  );
  finish();
  expect(await delivery).toBe(2500);
  const end = JSON.parse(messages.at(-2) as string);
  expect(end).toMatchObject({
    type: 'audio.end',
    sampleCount: 2500,
    frameCount: 6,
  });
  const tail = messages.at(-1) as Buffer;
  expect(tail.readUInt32LE(0)).toBe(5);
  expect(tail.subarray(208).every((byte) => byte === 0)).toBe(true);
});
