import { randomUUID } from 'node:crypto';
import type { ProviderServices } from '../providers/index.ts';
import type { CallHistoryRepository } from '../../ports/call-history-repository.ts';
import type { VoiceSink } from '../../ports/voice-session.ts';
import type { VoiceProfile, AudioClip } from '../../domain/voice/model.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import type { VoiceMetrics } from './metrics.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';
import { streamSpeech } from './speech-stream.ts';
import { buildVoiceContext } from './context.ts';

export type VoiceTurn = {
  sessionId: string;
  conversationId: string;
  ownerId: string;
  turnId: number;
  responseId: string;
  dataClass: DataClass;
  text?: string;
  audio?: AudioClip;
  profile: VoiceProfile | null;
  signal: AbortSignal;
  speechEndedAt: number;
};

export function createTurnProcessor(
  providers: Pick<ProviderServices, 'execute' | 'executeStream'>,
  history: CallHistoryRepository,
  metrics: VoiceMetrics,
) {
  return {
    async process(turn: VoiceTurn, sink: VoiceSink) {
      const { signal, turnId, responseId } = turn;

      const emit = (event: Parameters<VoiceSink['send']>[0]) => {
        signal.throwIfAborted();
        sink.send(event);
      };

      let text = turn.text;
      let firstAudio = true;

      const execute: typeof providers.execute = async (role, input, signal) => {
        try {
          return await providers.execute(role, input, signal);
        } catch (error) {
          if (
            error instanceof ApplicationError &&
            error.code === 'QUOTA_EXCEEDED'
          ) {
            emit({ type: 'quota.warning', turnId, role });
          }

          throw error;
        }
      };

      if (turn.audio) {
        const started = performance.now();

        try {
          const transcript = await execute(
            'stt',
            {
              content: '',
              audio: turn.audio,
              dataClass: turn.dataClass,
              maxTokens: 1000,
            },
            signal,
          );
          signal.throwIfAborted();
          text = transcript.content.trim();
          metrics.time('stt', performance.now() - started);
          emit({ type: 'transcript.final', turnId, text });
        } catch (error) {
          if (!(
            error instanceof ApplicationError &&
            error.code === 'NO_SPEECH_DETECTED'
          )) {
            metrics.count('textFallbacks');
          }

          throw error;
        }
      }

      if (!text?.trim() || text.length > 4000) {
        throw new VoiceInputError(
          'A fala transcrita deve conter de 1 a 4000 caracteres.',
        );
      }

      await history.updateTurn(responseId, { userText: text });
      signal.throwIfAborted();
      const recent = await history.recent(turn.conversationId, turn.ownerId, 6);
      const context = buildVoiceContext(recent, text, turn.dataClass);
      const started = performance.now();
      const segments = streamSpeech(async function* (streamSignal) {
        try {
          for await (const chunk of providers.executeStream(
            { ...context, maxTokens: 512 },
            streamSignal,
          )) {
            yield chunk.content;
          }
        } catch (error) {
          if (
            error instanceof ApplicationError &&
            error.code === 'QUOTA_EXCEEDED'
          ) {
            emit({ type: 'quota.warning', turnId, role: 'llm' });
          }

          throw error;
        } finally {
          metrics.time('llm', performance.now() - started);
        }
      }, signal);
      emit({ type: 'reply.start', turnId, responseId });
      const generated: string[] = [];
      let position = 0;

      for await (const spokenText of segments) {
        if (position === 0) {
          metrics.time('llmFirstSpeechSegment', performance.now() - started);
        }

        generated.push(spokenText);
        await history.updateTurn(responseId, {
          generatedText: generated.join(' '),
        });
        signal.throwIfAborted();
        const segmentId = randomUUID();
        await history.addSegment({
          id: segmentId,
          responseId,
          position,
          text: spokenText,
        });
        emit({
          type: 'reply.text',
          turnId,
          responseId,
          segmentId,
          position,
          text: spokenText,
        });

        if (!turn.profile) {
          metrics.count('textFallbacks');
          position++;
          continue;
        }

        let pcm: Buffer;
        const synthesisStart = performance.now();

        try {
          const synthesized = await execute(
            'tts',
            {
              content: spokenText,
              dataClass: context.dataClass,
              maxTokens: 1,
              voice: {
                id: turn.profile.id,
                referenceFile: turn.profile.referenceFile,
                referenceSha256: turn.profile.referenceSha256,
              },
            },
            signal,
          );
          signal.throwIfAborted();

          if (!synthesized.audio) {
            throw new VoiceInputError('O TTS não retornou áudio PCM.');
          }

          pcm = Buffer.from(synthesized.audio.pcmBase64, 'base64');

          if (
            !pcm.length ||
            pcm.length % 2 ||
            pcm.length > 3 * 1024 * 1024 ||
            pcm.toString('base64') !== synthesized.audio.pcmBase64
          ) {
            throw new VoiceInputError('Áudio sintetizado inválido.');
          }
        } catch (error) {
          if (signal.aborted) {
            throw error;
          }

          metrics.count('textFallbacks');
          emit({
            type: 'error',
            code: 'TTS_UNAVAILABLE_TEXT_AVAILABLE',
            recoverable: true,
          });
          position++;
          continue;
        }

        metrics.time('tts', performance.now() - synthesisStart);

        if (firstAudio) {
          metrics.time(
            'firstAudioAfterSpeechEnd',
            performance.now() - turn.speechEndedAt,
          );
          firstAudio = false;
        }

        await history.setAudio(segmentId, pcm.length / 2);
        emit({ type: 'state', turnId, state: 'speaking' });
        await sink.audio({ turnId, responseId, segmentId, pcm, signal });
        position++;
      }

      if (!generated.length) {
        throw new VoiceInputError('O modelo não retornou texto falável.');
      }

      await history.updateTurn(responseId, { status: 'completed' });
      metrics.count('completed');
      emit({ type: 'reply.done', turnId, responseId });
    },
  };
}
