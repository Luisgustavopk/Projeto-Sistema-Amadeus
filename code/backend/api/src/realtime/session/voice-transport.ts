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
    async audio(input) {
      input.signal.throwIfAborted();
      const frameCount = Math.ceil(input.pcm.length / 640);
      send({
        type: 'audio.segment',
        turnId: input.turnId,
        responseId: input.responseId,
        segmentId: input.segmentId,
        sampleCount: input.pcm.length / 2,
        frameCount,
        sampleRate: 16000,
      });

      for (let index = 0; index < frameCount; index++) {
        input.signal.throwIfAborted();

        if (
          socket.readyState !== WebSocket.OPEN ||
          socket.bufferedAmount > 65536
        ) {
          throw new VoiceInputError('Cliente de áudio indisponível ou lento.');
        }

        const frame = Buffer.alloc(648);
        frame.writeUInt32LE(index, 0);
        frame.writeUInt32LE(input.turnId, 4);
        frame.set(input.pcm.subarray(index * 640, (index + 1) * 640), 8);
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
