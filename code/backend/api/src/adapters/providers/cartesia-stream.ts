import { WebSocket, type ClientOptions } from 'ws';
import { randomUUID, createHash } from 'node:crypto';
import type { ProviderInput, ProviderOutput } from '../../ports/provider.ts';
import { cartesiaExpression } from './cartesia-expression.ts';
import {
  ProviderInvalidError,
  ProviderTemporarilyUnavailableError,
} from '../../domain/errors/providers.ts';

type Context = {
  id: string;
  lastOutputAt: number;
  flushId: number;
  socket: WebSocket;
  queue: unknown[];
  wake: () => void;
  failure?: Error;
  busy: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
const contexts = new Map<string, Context>();
const MAX_BYTES = 3 * 1024 * 1024;

export function cartesiaStreaming(
  key: string,
  voiceId: string,
  version: string,
  errorForStatus: (status: number, provider: string) => Error,
  connect: (url: string, options: ClientOptions) => WebSocket = (
    url,
    options,
  ) => new WebSocket(url, options),
) {
  const prefix =
    createHash('sha256').update(key).update(voiceId).digest('hex') + ':';

  const close = (id: string) => {
    const context = contexts.get(prefix + id);

    if (!context) {
      return;
    }

    contexts.delete(prefix + id);
    clearTimeout(context.timer);

    if (context.socket.readyState === WebSocket.OPEN) {
      context.socket.send(
        JSON.stringify({ context_id: context.id, cancel: true }),
      );
    }

    context.socket.terminate();
    context.failure ??= new ProviderTemporarilyUnavailableError(
      'Contexto de síntese encerrado.',
    );
    context.wake();
  };

  return {
    closeSpeech: close,
    async *streamAudio(
      input: ProviderInput,
      signal?: AbortSignal,
    ): AsyncIterable<ProviderOutput> {
      const id = input.speechContextId ?? randomUUID();
      const mapKey = prefix + id;
      signal?.throwIfAborted();
      let context = contexts.get(mapKey);

      // Cartesia expires a context one second after its last audio. Leave a
      // network margin; a delayed LLM block must not reuse that expired ID.
      if (
        context &&
        !context.busy &&
        Date.now() - context.lastOutputAt >= 500
      ) {
        close(id);
        context = undefined;
      }

      if (!context) {
        if (contexts.size >= 16) {
          throw new ProviderTemporarilyUnavailableError(
            'Limite de contextos de síntese.',
          );
        }

        const socket = connect(
          'wss://api.cartesia.ai/tts/websocket?cartesia_version=' +
            encodeURIComponent(version),
          {
            headers: { 'X-API-Key': key },
            maxPayload: MAX_BYTES * 2,
            handshakeTimeout: 5000,
            followRedirects: false,
          },
        );
        context = {
          id: randomUUID(),
          lastOutputAt: Date.now(),
          flushId: -1,
          socket,
          queue: [],
          wake: () => {},
          busy: false,
        };
        const state = context;
        socket.on('message', (data, binary) => {
          try {
            if (binary || data.toString().length > MAX_BYTES * 2) {
              throw new ProviderInvalidError(
                'Resposta de áudio excessiva ou inválida.',
              );
            }

            state.queue.push(JSON.parse(data.toString()));

            if (state.queue.length > 256) {
              throw new ProviderInvalidError('Fila de síntese excessiva.');
            }
          } catch (error) {
            state.failure =
              error instanceof Error ? error : new ProviderInvalidError();
          }

          state.wake();
        });
        socket.on('error', () => {
          state.failure ??= new ProviderTemporarilyUnavailableError(
            'Conexão de síntese indisponível.',
          );
          state.wake();
        });
        socket.on('close', () => {
          state.failure ??= new ProviderTemporarilyUnavailableError(
            'Conexão de síntese interrompida.',
          );
          state.wake();
        });
        socket.on('unexpected-response', (_request, response) => {
          state.failure = errorForStatus(
            response.statusCode ?? 503,
            'Cartesia',
          );
          response.resume();
          socket.terminate();
          state.wake();
        });
        contexts.set(mapKey, context);
      }

      const state = context;

      if (state.busy) {
        throw new ProviderInvalidError(
          'Sínteses simultâneas no mesmo contexto.',
        );
      }

      state.busy = true;
      clearTimeout(state.timer);

      const cancel = () => {
        state.failure = signal?.reason ?? new Error('Síntese cancelada.');
        close(id);
      };

      signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => {
        state.failure = new ProviderTemporarilyUnavailableError(
          'Prazo de síntese atingido.',
        );
        close(id);
      }, 15000);
      let completed = false;
      let contextFinished = false;

      try {
        if (state.socket.readyState === WebSocket.CONNECTING) {
          await new Promise<void>((resolve, reject) => {
            const opened = () => {
              state.socket.off('error', failed);
              state.socket.off('close', failed);
              resolve();
            };

            const failed = () => {
              state.socket.off('open', opened);
              state.socket.off('error', failed);
              state.socket.off('close', failed);
              reject(
                state.failure ?? new ProviderTemporarilyUnavailableError(),
              );
            };

            state.socket.once('open', opened);
            state.socket.once('error', failed);
            state.socket.once('close', failed);
          });
        }

        signal?.throwIfAborted();

        if (state.failure) {
          throw state.failure;
        }

        const delivery = cartesiaExpression(input.speechExpression);
        const settings = {
          ...(delivery
            ? { generation_config: delivery.generation_config }
            : {}),
          model_id: 'sonic-3.6',
          voice: { id: voiceId },
          language: 'pt',
          accent: 'brazilian-portuguese',
          context_id: state.id,
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000,
          },
          continue: true,
          max_buffer_delay_ms: 0,
        };
        state.socket.send(
          JSON.stringify({ ...settings, transcript: input.content + ' ' }),
        );
        state.socket.send(
          JSON.stringify({
            ...settings,
            transcript: '',
            flush: true,
          }),
        );
        let bytes = 0;
        let chunkFlushId: number | undefined;

        while (true) {
          signal?.throwIfAborted();

          if (state.failure) {
            throw state.failure;
          }

          const message = state.queue.shift() as
            | {
                context_id?: string;
                flush_id?: number;
                type?: string;
                status_code?: number;
                error_code?: string;
                data?: string;
                done?: boolean;
              }
            | undefined;

          if (!message) {
            await new Promise<void>((resolve) => {
              state.wake = resolve;
            });
            continue;
          }

          if (message.context_id !== state.id) {
            throw new ProviderInvalidError('Contexto de áudio divergente.');
          }

          if (message.type === 'error' || (message.status_code ?? 206) >= 400) {
            if (
              message.status_code === 400 &&
              /^[a-z_]{1,64}$/.test(message.error_code ?? '')
            ) {
              throw new ProviderInvalidError('Cartesia: ' + message.error_code);
            }

            throw errorForStatus(message.status_code ?? 503, 'Cartesia');
          }

          if (message.flush_id !== undefined) {
            if (!Number.isInteger(message.flush_id) || message.flush_id < 0) {
              throw new ProviderInvalidError(
                'Identificador de flush inválido.',
              );
            }

            if (message.flush_id <= state.flushId) {
              continue;
            }
          }

          if (message.type === 'chunk') {
            if (typeof message.data !== 'string') {
              throw new ProviderInvalidError('Chunk sem áudio.');
            }

            const pcm = Buffer.from(message.data, 'base64');
            chunkFlushId ??= message.flush_id;

            if (
              message.flush_id !== undefined &&
              message.flush_id !== chunkFlushId
            ) {
              throw new ProviderInvalidError(
                'Áudio de outro flush no segmento.',
              );
            }

            bytes += pcm.length;
            state.lastOutputAt = Date.now();

            if (
              !pcm.length ||
              pcm.length % 2 ||
              pcm.toString('base64') !== message.data ||
              bytes > MAX_BYTES
            ) {
              throw new ProviderInvalidError('Áudio PCM inválido.');
            }

            yield {
              progressiveAudio: true,
              ...(delivery
                ? { speechExpressionApplied: delivery.expression }
                : {}),
              content: '',
              inputTokens: null,
              outputTokens: null,
              audio: {
                pcmBase64: message.data,
                sampleRate: 24000,
                channels: 1,
              },
            };
          } else if (message.type === 'flush_done' || message.type === 'done') {
            if (!bytes) {
              if (message.type === 'flush_done') {
                // Custom buffering can flush the transcript before the explicit
                // empty flush; that second acknowledgement contains no audio.
                state.flushId = Math.max(state.flushId, message.flush_id ?? 0);
                continue;
              }

              throw new ProviderInvalidError('Síntese vazia.');
            }

            if (
              chunkFlushId !== undefined &&
              message.flush_id !== undefined &&
              chunkFlushId !== message.flush_id
            ) {
              throw new ProviderInvalidError('Fim de outro flush no segmento.');
            }

            state.flushId = Math.max(state.flushId, message.flush_id ?? 0);
            contextFinished = message.type === 'done';
            completed = true;
            break;
          } else {
            throw new ProviderInvalidError('Evento inesperado na síntese.');
          }
        }
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
        state.busy = false;

        if (!completed || contextFinished || !input.speechContextId) {
          close(id);
        } else {
          state.timer = setTimeout(() => close(id), 500);
          state.timer.unref();
        }
      }
    },
  };
}
