import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { createVoiceTransport } from '../../src/realtime/session/voice-transport.ts';

it.each([16000, 24000] as const)(
  'preserva PCM de %i Hz nos quadros e metadados de saída',
  async (sampleRate) => {
    const sent: (string | Buffer)[] = [];
    const socket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send(
        data: string | Buffer,
        options?: unknown,
        callback?: (error?: Error) => void,
      ) {
        sent.push(data);
        callback?.();
      },
    } as unknown as WebSocket;
    const frameBytes = (sampleRate / 50) * 2;
    const pcm = Buffer.alloc(frameBytes + 6, 7);
    await createVoiceTransport(socket, randomUUID()).audio({
      turnId: 1,
      responseId: randomUUID(),
      segmentId: randomUUID(),
      pcm,
      sampleRate,
      signal: new AbortController().signal,
    });
    expect(JSON.parse(sent[0] as string)).toMatchObject({
      type: 'audio.segment',
      sampleRate,
      sampleCount: pcm.length / 2,
      frameCount: 2,
    });
    const frames = sent.slice(1) as Buffer[];
    expect(frames.map((frame) => frame.length)).toEqual([
      frameBytes + 8,
      frameBytes + 8,
    ]);
    expect(frames[1]!.readUInt32LE(0)).toBe(1);
    const delivered = Buffer.concat(frames.map((frame) => frame.subarray(8)));
    expect(delivered.subarray(0, pcm.length)).toEqual(pcm);
    expect(delivered.subarray(pcm.length).every((byte) => byte === 0)).toBe(
      true,
    );
  },
);
