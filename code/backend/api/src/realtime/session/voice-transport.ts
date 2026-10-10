import { WebSocket } from 'ws';
import type { VoiceSink } from '../../ports/voice-session.ts';
import { VoicePayload } from '../protocol/voice-server-events.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';

export function createVoiceTransport(
  socket: WebSocket,
  sessionId: string,
): VoiceSink {
  let sequence = 0;

  const send: VoiceSink['send'] = (event) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          ...VoicePayload.parse(event),
          protocolVersion: '1.1',
          sessionId,
          seq: sequence++,
        }),
      );
    }
  };

  return {
    send,
    async audioStream(input) {
      const frameBytes = (input.sampleRate / 50) * 2;
      let pending = Buffer.alloc(0);
      let samples = 0;
      let index = 0;

      const frame = async (pcm: Uint8Array) => {
        input.signal.throwIfAborted();

        if (
          socket.readyState !== WebSocket.OPEN ||
          socket.bufferedAmount > 65536
        ) {
          throw new VoiceInputError('Cliente de áudio indisponível ou lento.');
        }

        const value = Buffer.alloc(8 + frameBytes);
        value.writeUInt32LE(index++, 0);
        value.writeUInt32LE(input.turnId, 4);
        value.set(pcm, 8);
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timer);
            input.signal.removeEventListener('abort', cancel);

            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          const cancel = () => finish(new Error('Audio delivery cancelled'));
          const timer = setTimeout(
            () => finish(new Error('Audio delivery timeout')),
            3000,
          );
          input.signal.addEventListener('abort', cancel, { once: true });

          if (input.signal.aborted) {
            cancel();

            return;
          }

          socket.send(value, { binary: true }, (error) =>
            finish(error ?? undefined),
          );
        });
      };

      send({
        type: 'audio.start',
        turnId: input.turnId,
        responseId: input.responseId,
        segmentId: input.segmentId,
        sampleRate: input.sampleRate,
      });

      for await (const chunk of input.chunks) {
        input.signal.throwIfAborted();

        if (!chunk.length || chunk.length % 2) {
          throw new VoiceInputError('Chunk PCM inválido.');
        }

        samples += chunk.length / 2;

        if (samples > input.sampleRate * 90) {
          throw new VoiceInputError('Áudio excede 90 segundos.');
        }

        pending = Buffer.concat([pending, chunk]);

        while (pending.length >= frameBytes) {
          await frame(pending.subarray(0, frameBytes));
          pending = pending.subarray(frameBytes);
        }
      }

      if (!samples) {
        throw new VoiceInputError('Áudio vazio.');
      }

      // Final length arrives before a padded tail can be scheduled by the client.
      send({
        type: 'audio.end',
        turnId: input.turnId,
        responseId: input.responseId,
        segmentId: input.segmentId,
        sampleCount: samples,
        frameCount: Math.ceil(samples / (frameBytes / 2)),
      });

      if (pending.length) {
        await frame(pending);
      }

      return samples;
    },
    async audio(input) {
      input.signal.throwIfAborted();
      const frameBytes = (input.sampleRate / 50) * 2;
      const frameCount = Math.ceil(input.pcm.length / frameBytes);
      send({
        type: 'audio.segment',
        turnId: input.turnId,
        responseId: input.responseId,
        segmentId: input.segmentId,
        sampleCount: input.pcm.length / 2,
        frameCount,
        sampleRate: input.sampleRate,
      });

      for (let index = 0; index < frameCount; index++) {
        input.signal.throwIfAborted();

        if (
          socket.readyState !== WebSocket.OPEN ||
          socket.bufferedAmount > 65536
        ) {
          throw new VoiceInputError('Cliente de áudio indisponível ou lento.');
        }

        const frame = Buffer.alloc(8 + frameBytes);
        frame.writeUInt32LE(index, 0);
        frame.writeUInt32LE(input.turnId, 4);
        frame.set(
          input.pcm.subarray(index * frameBytes, (index + 1) * frameBytes),
          8,
        );
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timeout);
            input.signal.removeEventListener('abort', cancelled);

            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          const cancelled = () => finish(new Error('Audio delivery cancelled'));
          const timeout = setTimeout(
            () => finish(new Error('Audio delivery timeout')),
            3000,
          );
          input.signal.addEventListener('abort', cancelled, { once: true });

          if (input.signal.aborted) {
            cancelled();

            return;
          }

          socket.send(frame, { binary: true }, (error) =>
            finish(error ?? undefined),
          );
        });
      }
    },
  };
}
