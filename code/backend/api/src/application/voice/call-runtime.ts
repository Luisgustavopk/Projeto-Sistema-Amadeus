import { randomUUID } from 'node:crypto';
import type { CallHistoryRepository } from '../../ports/call-history-repository.ts';
import type { VoiceSink } from '../../ports/voice-session.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';
import type { VoiceProfile } from '../../domain/voice/model.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import { AudioTurnBuffer } from '../../domain/voice/audio-buffer.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import type { createTurnProcessor } from './turn-processor.ts';
import type { VoiceMetrics } from './metrics.ts';
import { createSpeechPreview } from './speech-preview.ts';
import { measureVoiceAudio } from './audio-observations.ts';

export function createCallRuntime(input: {
  sessionId: string;
  conversationId: string;
  ownerId: string;
  dataClass: DataClass;
  profile: VoiceProfile | null;
  history: CallHistoryRepository;
  processor: ReturnType<typeof createTurnProcessor>;
  gate: ExecutionGate;
  sink: VoiceSink;
  metrics: VoiceMetrics;
}) {
  let active: {
    responseId: string;
    turnId: number;
    abort: AbortController;
    finished: Promise<void>;
    generated: boolean;
    playbackEnded: boolean;
  } | null = null;
  let capture: { turnId: number; buffer: AudioTurnBuffer } | null = null;
  let pendingSpeech: { turnId: number; abort: AbortController } | null = null;
  let latestTurnId = 0;
  let closed = false;
  const pending = new Set<Promise<void>>();
  let previousExecution = Promise.resolve();

  const finishPlayback = (turn: NonNullable<typeof active>) => {
    if (active !== turn || !turn.generated || !turn.playbackEnded || closed) {
      return;
    }

    active = null;
    input.sink.send({ type: 'state', turnId: turn.turnId, state: 'idle' });
  };

  const interrupt = () => {
    const started = performance.now();

    if (active) {
      active.abort.abort();
      input.sink.send({
        type: 'interrupted',
        turnId: active.turnId,
        responseId: active.responseId,
      });
      input.metrics.time(
        'interruptAcknowledgement',
        performance.now() - started,
      );
      active = null;
    }
  };

  const preview = createSpeechPreview({
    enabled: () => !closed && active !== null,
    transcribe: (turnId, audio, signal) =>
      input.processor.preview(
        { turnId, dataClass: input.dataClass, signal },
        audio,
        input.sink,
      ),
    confirmed: (turnId, text) => {
      input.sink.send({ type: 'transcript.partial', turnId, text });
      interrupt();
      input.sink.send({ type: 'state', turnId, state: 'listening' });
    },
  });

  const validateTurn = (turnId: number, cancelActive = true) => {
    if (
      closed ||
      !Number.isInteger(turnId) ||
      turnId < 1 ||
      turnId > 4294967295 ||
      turnId <= latestTurnId
    ) {
      throw new VoiceInputError(
        'Use um identificador de turno novo e crescente.',
      );
    }

    latestTurnId = turnId;
    preview.cancel();
    pendingSpeech?.abort.abort();
    pendingSpeech = null;

    if (cancelActive) {
      interrupt();
    }
  };

  const run = (
    turnId: number,
    source: {
      text?: string;
      audio?: { pcmBase64: string; sampleRate: 16000; channels: 1 };
      audioObservations?: ReturnType<typeof measureVoiceAudio>;
    },
    speechEndedAt = performance.now(),
  ) => {
    const abort = new AbortController();
    const responseId = randomUUID();
    const release = input.gate.beginExecution();
    input.metrics.count('turns');
    input.sink.send({ type: 'state', turnId, state: 'thinking' });
    const turn = {
      responseId,
      turnId,
      abort,
      finished: Promise.resolve(),
      generated: false,
      playbackEnded: false,
    };
    active = turn;
    const preceding = previousExecution;

    turn.finished = (async () => {
      try {
        // Persist cancellation of the preceding response before building context.
        // This also prevents overlapping generation within the same call.
        await preceding;
        abort.signal.throwIfAborted();
        await input.history.beginTurn({
          id: randomUUID(),
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          clientTurnId: turnId,
          responseId,
          dataClass: input.dataClass,
        });
        abort.signal.throwIfAborted();
        await input.processor.process(
          {
            ...source,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            ownerId: input.ownerId,
            turnId,
            responseId,
            dataClass: input.dataClass,
            profile: input.profile,
            signal: abort.signal,
            speechEndedAt,
          },
          input.sink,
        );
        turn.generated = true;
        finishPlayback(turn);
      } catch (error) {
        const cancelled = abort.signal.aborted;
        await input.history.updateTurn(responseId, {
          status: cancelled ? 'interrupted' : 'failed',
        });
        const noSpeech =
          error instanceof ApplicationError &&
          error.code === 'NO_SPEECH_DETECTED';
        input.metrics.count(
          cancelled ? 'interrupted' : noSpeech ? 'noSpeech' : 'failed',
        );

        if (!cancelled) {
          if (active === turn) {
            active = null;
          }

          input.metrics.failure(
            error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          );
        }

        if (noSpeech && !cancelled && !closed) {
          if (active === turn) {
            active = null;
          }

          input.sink.send({
            type: 'error',
            code: 'NO_SPEECH_DETECTED',
            recoverable: true,
          });
          input.sink.send({ type: 'state', turnId, state: 'idle' });
        }

        if (!cancelled && !closed && !noSpeech) {
          const code =
            error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR';

          input.sink.send({ type: 'error', turnId, code, recoverable: true });
          input.sink.send({ type: 'state', turnId, state: 'error' });
        }
      } finally {
        release();
      }
    })().catch(() => {
      if (active === turn) {
        active = null;
      }

      if (!closed && !abort.signal.aborted) {
        input.sink.send({
          type: 'error',
          turnId,
          code: 'PERSISTENCE_FAILED',
          recoverable: false,
        });
        input.sink.send({ type: 'state', turnId, state: 'error' });
      }
    });
    previousExecution = turn.finished;
    pending.add(turn.finished);
    void turn.finished.finally(() => pending.delete(turn.finished));
  };

  const recognizeSpeech = (
    turnId: number,
    audio: { pcmBase64: string; sampleRate: 16000; channels: 1 },
    speechEndedAt: number,
  ) => {
    const abort = new AbortController();
    pendingSpeech = { turnId, abort };
    const recognition = (async () => {
      try {
        const text = await input.processor.transcribe(
          { turnId, dataClass: input.dataClass, signal: abort.signal },
          audio,
          input.sink,
        );

        if (abort.signal.aborted || closed || pendingSpeech?.abort !== abort) {
          return;
        }

        interrupt();
        pendingSpeech = null;
        run(
          turnId,
          { text, audioObservations: measureVoiceAudio(audio, text) },
          speechEndedAt,
        );
      } catch (error) {
        if (abort.signal.aborted || closed) {
          return;
        }

        const noSpeech =
          error instanceof ApplicationError &&
          error.code === 'NO_SPEECH_DETECTED';
        input.metrics.count(noSpeech ? 'noSpeech' : 'failed');

        input.metrics.failure(
          error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        );

        input.sink.send({
          type: 'error',
          turnId,
          code: noSpeech
            ? 'NO_SPEECH_DETECTED'
            : error instanceof ApplicationError
              ? error.code
              : 'INTERNAL_ERROR',
          recoverable: true,
        });

        if (!active) {
          input.sink.send({
            type: 'state',
            turnId,
            state: noSpeech ? 'idle' : 'error',
          });
        }
      } finally {
        if (pendingSpeech?.abort === abort) {
          pendingSpeech = null;
        }
      }
    })();
    pending.add(recognition);
    void recognition.finally(() => pending.delete(recognition));
  };

  return {
    speechStart(turnId: number) {
      validateTurn(turnId, false);
      capture = { turnId, buffer: new AudioTurnBuffer(turnId) };
      preview.start(turnId);
    },
    appendAudio(frame: Uint8Array) {
      if (!capture) {
        throw new VoiceInputError('Inicie a fala antes de enviar áudio.');
      }

      capture.buffer.append(frame);
      preview.append(capture.buffer);
    },
    speechEnd(turnId: number) {
      if (!capture || capture.turnId !== turnId) {
        throw new VoiceInputError('Turno de fala inválido.');
      }

      const pcm = capture.buffer.finish();
      preview.cancel();
      capture = null;
      const speechEndedAt = performance.now();
      recognizeSpeech(
        turnId,
        {
          pcmBase64: Buffer.from(pcm).toString('base64'),
          sampleRate: 16000,
          channels: 1,
        },
        speechEndedAt,
      );
    },
    text(turnId: number, text: string) {
      if (!text.trim() || text.length > 4000) {
        throw new VoiceInputError('Texto deve conter de 1 a 4000 caracteres.');
      }

      validateTurn(turnId);
      capture = null;
      run(turnId, { text });
    },
    interrupt() {
      preview.cancel();
      capture = null;
      pendingSpeech?.abort.abort();
      pendingSpeech = null;
      interrupt();
      input.sink.send({ type: 'state', turnId: latestTurnId, state: 'idle' });
    },
    async acknowledge(event: {
      responseId: string;
      segmentId: string;
      playedSamples: number;
    }) {
      if (
        !(await input.history.acknowledge({
          ...event,
          sessionId: input.sessionId,
        }))
      ) {
        throw new VoiceInputError('Confirmação de reprodução inválida.');
      }
    },
    playbackEnded(responseId: string) {
      if (active?.responseId === responseId) {
        active.playbackEnded = true;
        finishPlayback(active);
      }
    },
    async close(state: 'closed' | 'disconnected') {
      if (closed) {
        return;
      }

      closed = true;
      preview.cancel();
      capture = null;
      pendingSpeech?.abort.abort();
      pendingSpeech = null;

      if (active) {
        active.abort.abort();
      }

      await Promise.allSettled([...pending, preview.close()]);
      await input.history.endSession(input.sessionId, state);
    },
  };
}

export type CallRuntime = ReturnType<typeof createCallRuntime>;
