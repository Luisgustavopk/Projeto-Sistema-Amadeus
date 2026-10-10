import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type {
  ProviderFactory,
  ProviderInput,
  ProviderOutput,
} from '../../ports/provider.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';
import { validateProviderInput, estimateProviderBudget } from './input.ts';
import { selectProviderAttempts } from './routing.ts';
import { assertProviderCanExecute } from '../../domain/providers/data-policy.ts';
import {
  createProviderCooldowns,
  type ProviderCooldowns,
} from './cooldowns.ts';
import {
  filterProviderAttemptsForDataClass,
  canUseFallback,
  notifyFallback,
  type NotifyProviderFallback,
} from './fallback.ts';
import {
  ProviderInvalidError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';

export function createAudioStreaming(
  configuration: ProviderConfigurationRepository,
  usage: ProviderUsageRepository,
  ownerId: string,
  factory: ProviderFactory,
  gate: ExecutionGate,
  onFallback?: NotifyProviderFallback,
  cooldowns: ProviderCooldowns = createProviderCooldowns(),
) {
  return {
    async speechVoiceId() {
      return (await configuration.get(ownerId)).tts.voiceId ?? null;
    },
    async *executeAudioStream(
      input: ProviderInput,
      signal?: AbortSignal,
    ): AsyncIterable<ProviderOutput> {
      validateProviderInput('tts', input);
      const release = gate.beginExecution();

      try {
        const configured = selectProviderAttempts(
          'tts',
          (await configuration.get(ownerId)).tts,
          input,
        );
        const attempts = filterProviderAttemptsForDataClass(
          configured,
          input.dataClass,
        );

        if (!attempts.length) {
          assertProviderCanExecute(configured[0]!, input.dataClass);
        }

        for (let index = 0; index < attempts.length; index++) {
          signal?.throwIfAborted();
          const config = attempts[index]!;
          assertProviderCanExecute(config, input.dataClass);
          const blocked =
            config.adapter === 'cartesia'
              ? cooldowns.blocked(config)
              : undefined;

          if (blocked) {
            if (!attempts[index + 1]) {
              throw blocked;
            }

            notifyFallback(config, attempts[index + 1]!, blocked, onFallback);
            continue;
          }

          let reservation: string;

          try {
            reservation = await usage.reserve(
              ownerId,
              'tts',
              config,
              estimateProviderBudget(input),
            );
          } catch (error) {
            if (
              !attempts[index + 1] ||
              !(error instanceof QuotaExceededError) ||
              signal?.aborted
            ) {
              throw error;
            }

            notifyFallback(config, attempts[index + 1]!, error, onFallback);
            continue;
          }

          let delivered = false;
          let settled = false;

          try {
            const provider = factory('tts', config);
            const chunks = provider.streamAudio
              ? provider.streamAudio(input, signal)
              : (async function* () {
                  yield await provider.execute(input, signal);
                })();
            let bytes = 0;
            let rate: number | undefined;

            for await (const chunk of chunks) {
              signal?.throwIfAborted();
              const audio = chunk.audio;

              if (
                !audio ||
                audio.channels !== 1 ||
                ![16000, 24000].includes(audio.sampleRate)
              ) {
                throw new ProviderInvalidError('Formato de áudio inválido.');
              }

              const pcm = Buffer.from(audio.pcmBase64, 'base64');
              bytes += pcm.length;

              if (
                !pcm.length ||
                pcm.length % 2 ||
                bytes > 3 * 1024 * 1024 ||
                pcm.toString('base64') !== audio.pcmBase64 ||
                (rate && rate !== audio.sampleRate)
              ) {
                throw new ProviderInvalidError('Chunk PCM inválido.');
              }

              rate = audio.sampleRate;
              delivered = true;
              yield chunk;
            }

            if (!delivered) {
              throw new ProviderInvalidError('Síntese vazia.');
            }

            settled = true;
            await usage.settle(reservation, {
              inputTokens: null,
              outputTokens: null,
            });

            return;
          } catch (error) {
            if (config.adapter === 'cartesia') {
              cooldowns.record(config, error, signal);
            }

            // Never replace partially heard audio with a second voice/replay.
            if (
              settled ||
              !attempts[index + 1] ||
              !canUseFallback(error, signal, delivered)
            ) {
              throw error;
            }

            notifyFallback(config, attempts[index + 1]!, error, onFallback);
          } finally {
            if (!settled) {
              await usage.settle(reservation, null);
            }
          }
        }
      } finally {
        release();
      }
    },
    async closeSpeech(contextId: string) {
      const config = (await configuration.get(ownerId)).tts;

      for (const attempt of selectProviderAttempts('tts', config, {
        content: '',
        dataClass: 'synthetic',
        maxTokens: 1,
      })) {
        try {
          factory('tts', attempt).closeSpeech?.(contextId);
        } catch {
          /* Cleanup must not mask a turn error. */
        }
      }
    },
  };
}
