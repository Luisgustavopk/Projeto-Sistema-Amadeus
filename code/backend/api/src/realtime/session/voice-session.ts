import { randomUUID } from 'node:crypto';
import type { WebSocket, RawData } from 'ws';
import type { VoiceSessions } from '../../application/voice/sessions.ts';
import type { CallRuntime } from '../../application/voice/call-runtime.ts';
import type { ClientMessage } from '../protocol/client-events.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import { createVoiceTransport } from './voice-transport.ts';

export function createVoiceSession(
  socket: WebSocket,
  sessions: VoiceSessions,
  conversationId: string,
) {
  const sessionId = randomUUID();
  const sink = createVoiceTransport(socket, sessionId);
  let runtime: CallRuntime | undefined;
  let opening = false;
  let closed = false;
  let controls = 0;
  let acknowledgements = 0;
  const reset = setInterval(() => {
    controls = 0;
    acknowledgements = 0;
  }, 60000);
  reset.unref();
  const lifetime = setTimeout(
    () => socket.close(1000, 'Voice connection expired'),
    1800000,
  );
  lifetime.unref();

  const fail = (error: unknown) => {
    sink.send({
      type: 'error',
      code:
        error instanceof ApplicationError ? error.code : 'INVALID_VOICE_EVENT',
      recoverable:
        error instanceof ApplicationError && error.code === 'PROVIDER_BUSY',
    });

    if (!(
      error instanceof ApplicationError && error.code === 'PROVIDER_BUSY'
    )) {
      socket.close(1008, 'Invalid voice event');
    }
  };

  socket.once('close', () => {
    closed = true;
    clearInterval(reset);
    clearTimeout(lifetime);
    void runtime?.close('disconnected').catch(() => undefined);
  });

  return {
    start(event: Extract<ClientMessage, { type: 'session.start' }>) {
      opening = true;
      void sessions
        .open({
          sessionId,
          conversationId,
          dataClass: event.dataClass ?? 'personal',
          sink,
        })
        .then(async (value) => {
          runtime = value;
          opening = false;

          if (closed) {
            await value.close('disconnected');

            return;
          }

          socket.send(
            JSON.stringify({
              type: 'session.ready',
              protocolVersion: '1.1',
              sessionId,
              stage: 'voice',
              audio: event.audio,
            }),
          );
          sink.send({ type: 'state', turnId: 0, state: 'idle' });
        })
        .catch(fail);
    },
    accept(data: RawData, binary: boolean, event?: ClientMessage) {
      if (!runtime || opening || closed) {
        fail(new Error());

        return;
      }

      try {
        if (binary) {
          const bytes = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(
                data instanceof ArrayBuffer ? new Uint8Array(data) : data,
              );
          runtime.appendAudio(bytes);

          return;
        }

        if (++controls > 600) {
          fail(new Error());

          return;
        }

        switch (event?.type) {
          case 'speech.start':
            runtime.speechStart(event.turnId);
            break;
          case 'speech.end':
            runtime.speechEnd(event.turnId);
            break;
          case 'text.send':
            runtime.text(event.turnId, event.text);
            break;
          case 'interrupt':
            runtime.interrupt();
            break;
          case 'playback.progress':
            if (++acknowledgements > 180) {
              fail(new Error());

              return;
            }

            void runtime.acknowledge(event).catch(fail);
            break;
          case 'playback.ended':
            runtime.playbackEnded(event.responseId);
            break;
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong', id: event.id }));
            break;
          case 'session.end':
            void runtime
              .close('closed')
              .then(() => {
                socket.send(JSON.stringify({ type: 'session.closed' }));
                socket.close(1000, 'Session ended');
              })
              .catch(fail);
            break;
          default:
            fail(new Error());
        }
      } catch (error) {
        fail(error);
      }
    },
  };
}
