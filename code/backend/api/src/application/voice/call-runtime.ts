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
  } | null = null;
  let capture: { turnId: number; buffer: AudioTurnBuffer } | null = null;
  let latestTurnId = 0;
  let closed = false;
  const pending = new Set<Promise<void>>();

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

  const validateTurn = (turnId: number) => {
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
    interrupt();
  };

  const run = (
    turnId: number,
    source: {
      text?: string;
      audio?: { pcmBase64: string; sampleRate: 16000; channels: 1 };
    },
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
    };
    active = turn;

    turn.finished = (async () => {
      try {
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
            speechEndedAt: performance.now(),
          },
          input.sink,
        );
        turn.generated = true;
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

        if (noSpeech && !cancelled && !closed) {
          if (active === turn) {
            active = null;
          }

          input.sink.send({ type: 'state', turnId, state: 'idle' });
        }

        if (!cancelled && !closed && !noSpeech) {
          const code =
            error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR';

          input.sink.send({ type: 'error', code, recoverable: true });
          input.sink.send({ type: 'state', turnId, state: 'error' });
        }
      } finally {
        release();
      }
    })().catch(() => {
      if (!closed) {
        input.sink.send({
          type: 'error',
          code: 'PERSISTENCE_FAILED',
          recoverable: false,
        });
      }
    });
    pending.add(turn.finished);
    void turn.finished.finally(() => pending.delete(turn.finished));
  };

  return {
    speechStart(turnId: number) {
      validateTurn(turnId);
      capture = { turnId, buffer: new AudioTurnBuffer(turnId) };
      input.sink.send({ type: 'state', turnId, state: 'listening' });
    },
    appendAudio(frame: Uint8Array) {
      if (!capture) {
        throw new VoiceInputError('Inicie a fala antes de enviar áudio.');
      }

      capture.buffer.append(frame);
    },
    speechEnd(turnId: number) {
      if (!capture || capture.turnId !== turnId) {
        throw new VoiceInputError('Turno de fala inválido.');
      }

      const pcm = capture.buffer.finish();
      capture = null;
      run(turnId, {
        audio: {
          pcmBase64: Buffer.from(pcm).toString('base64'),
          sampleRate: 16000,
          channels: 1,
        },
      });
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
      capture = null;
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
      if (active?.responseId === responseId && active.generated) {
        input.sink.send({
          type: 'state',
          turnId: active.turnId,
          state: 'idle',
        });
        active = null;
      }
    },
    async close(state: 'closed' | 'disconnected') {
      if (closed) {
        return;
      }

      closed = true;
      capture = null;

      if (active) {
        active.abort.abort();
      }

      await Promise.allSettled([...pending]);
      await input.history.endSession(input.sessionId, state);
    },
  };
}

export type CallRuntime = ReturnType<typeof createCallRuntime>;
