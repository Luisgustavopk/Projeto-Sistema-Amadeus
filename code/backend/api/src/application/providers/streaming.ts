import {
  createProviderCooldowns,
  type ProviderCooldowns,
} from './cooldowns.ts';
import { selectProviderAttempts } from './routing.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { withFirstChunkDeadline } from './first-chunk.ts';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type {
  ProviderFactory,
  ProviderInput,
  ProviderOutput,
} from '../../ports/provider.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';
import { assertProviderCanExecute } from '../../domain/providers/data-policy.ts';
import {
  DataPolicyBlockedError,
  ProviderInvalidError,
  ProviderTemporarilyUnavailableError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';
import { validateProviderInput, estimateProviderBudget } from './input.ts';
import {
  filterProviderAttemptsForDataClass,
  canUseFallback,
  notifyFallback,
  type NotifyProviderFallback,
  type ProviderFallbackNotice,
} from './fallback.ts';

export type ProviderStreamOptions = {
  firstChunkTimeoutMs?: number;
  onFallback?: (notice: ProviderFallbackNotice) => void | Promise<void>;
};

export function createProviderStreaming(
  configuration: ProviderConfigurationRepository,
  usage: ProviderUsageRepository,
  ownerId: string,
  factory: ProviderFactory,
  gate: ExecutionGate,
  onFallback?: NotifyProviderFallback,
  cooldowns: ProviderCooldowns = createProviderCooldowns(),
) {
  return {
    async *executeStream(
      input: ProviderInput,
      signal?: AbortSignal,
      options: ProviderStreamOptions = {},
    ): AsyncIterable<ProviderOutput> {
      validateProviderInput('llm', input);
      const release = gate.beginExecution();

      try {
        const providerConfig = (await configuration.get(ownerId)).llm;
        const configuredAttempts = selectProviderAttempts(
          'llm',
          providerConfig,
          input,
        );
        const attempts = filterProviderAttemptsForDataClass(
          configuredAttempts,
          input.dataClass,
        );

        const fallback = async (
          from: typeof providerConfig,
          to: typeof providerConfig,
          error: unknown,
        ) => {
          const notice = notifyFallback(from, to, error, onFallback);
          await options.onFallback?.(notice);
          signal?.throwIfAborted();
        };

        if (!attempts.length) {
          assertProviderCanExecute(configuredAttempts[0]!, input.dataClass);
        }

        if (attempts[0] !== configuredAttempts[0]) {
          await fallback(
            configuredAttempts[0]!,
            attempts[0]!,
            new DataPolicyBlockedError(),
          );
        }

        let retriedLastAttempt = false;

        for (let index = 0; index < attempts.length; index++) {
          signal?.throwIfAborted();
          const config = attempts[index]!;
          assertProviderCanExecute(config, input.dataClass);
          const blocked =
            retriedLastAttempt && index === attempts.length - 1
              ? undefined
              : cooldowns.blocked(config);

          if (blocked) {
            const next = attempts[index + 1];

            if (!next) {
              throw blocked;
            }

            await fallback(config, next, blocked);
            continue;
          }

          let reservation: string;

          try {
            reservation = await usage.reserve(
              ownerId,
              'llm',
              config,
              estimateProviderBudget(input),
            );
          } catch (error) {
            const next = attempts[index + 1];

            if (
              !next ||
              !(error instanceof QuotaExceededError) ||
              signal?.aborted
            ) {
              throw error;
            }

            await fallback(config, next, error);
            continue;
          }

          let settled = false;
          let delivered = false;
          let retry = false;
          let retrySameProvider = false;
          let fallbackError: unknown;

          try {
            const provider = factory('llm', config);
            let length = 0;
            const output: ProviderOutput = {
              content: '',
              inputTokens: null,
              outputTokens: null,
            };
            const source = withFirstChunkDeadline(
              (attemptSignal) =>
                provider.stream
                  ? provider.stream(input, attemptSignal)
                  : (async function* () {
                      yield await provider.execute(input, attemptSignal);
                    })(),
              signal,
              options.firstChunkTimeoutMs,
            );

            for await (const chunk of source) {
              signal?.throwIfAborted();
              length += chunk.content.length;

              if (length > 65536) {
                throw new ProviderInvalidError(
                  'Resposta de streaming excedeu o limite.',
                );
              }

              output.content += chunk.content;
              output.inputTokens = chunk.inputTokens ?? output.inputTokens;
              output.outputTokens = chunk.outputTokens ?? output.outputTokens;
              delivered ||= Boolean(chunk.content);
              yield chunk;
            }

            signal?.throwIfAborted();

            if (!output.content.trim()) {
              throw new ProviderInvalidError('Resposta de streaming vazia.');
            }

            // A failure during settlement must not start another generation.
            settled = true;
            await usage.settle(reservation, output);

            cooldowns.clear(config);

            return;
          } catch (error) {
            if (!settled) {
              cooldowns.record(config, error, signal);
            }

            const next = attempts[index + 1];

            if (settled || !canUseFallback(error, signal, delivered)) {
              throw error;
            }

            // The last eligible provider may be the only one approved for
            // personal data. Retry it once, with a new budget reservation,
            // only on temporary failure before any chunk was delivered.
            retrySameProvider =
              !next &&
              !retriedLastAttempt &&
              error instanceof ProviderTemporarilyUnavailableError &&
              (error.retryAfterMs ?? 0) <= 400;

            if (!next && !retrySameProvider) {
              throw error;
            }

            retry = true;
            fallbackError = error;
          } finally {
            if (!settled) {
              await usage.settle(reservation, null);
            }
          }

          if (retrySameProvider) {
            retriedLastAttempt = true;
            await delay(400, undefined, { signal });
            index--;
            continue;
          }

          if (retry) {
            await fallback(config, attempts[index + 1]!, fallbackError);
          }
        }
      } finally {
        release();
      }
    },
  };
}
