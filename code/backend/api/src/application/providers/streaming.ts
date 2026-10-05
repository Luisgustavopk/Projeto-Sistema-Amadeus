import { selectProviderAttempts } from './routing.ts';
import { setTimeout as delay } from 'node:timers/promises';
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
  QuotaExceededError,
} from '../../domain/errors/providers.ts';
import { validateProviderInput, estimateProviderBudget } from './input.ts';
import {
  filterProviderAttemptsForDataClass,
  canUseFallback,
  notifyFallback,
  type NotifyProviderFallback,
} from './fallback.ts';

export function createProviderStreaming(
  configuration: ProviderConfigurationRepository,
  usage: ProviderUsageRepository,
  ownerId: string,
  factory: ProviderFactory,
  gate: ExecutionGate,
  onFallback?: NotifyProviderFallback,
) {
  return {
    async *executeStream(
      input: ProviderInput,
      signal?: AbortSignal,
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

        if (!attempts.length) {
          assertProviderCanExecute(configuredAttempts[0]!, input.dataClass);
        }

        if (attempts[0] !== configuredAttempts[0]) {
          notifyFallback(
            configuredAttempts[0]!,
            attempts[0]!,
            new DataPolicyBlockedError(),
            onFallback,
          );
        }

        let retriedLastAttempt = false;

        for (let index = 0; index < attempts.length; index++) {
          signal?.throwIfAborted();
          const config = attempts[index]!;
          assertProviderCanExecute(config, input.dataClass);
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

            notifyFallback(config, next, error, onFallback);
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
            const source = provider.stream
              ? provider.stream(input, signal)
              : (async function* () {
                  yield await provider.execute(input, signal);
                })();

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
              delivered = true;
              yield chunk;
            }

            signal?.throwIfAborted();

            if (!output.content.trim()) {
              throw new ProviderInvalidError('Resposta de streaming vazia.');
            }

            // A failure during settlement must not start another generation.
            settled = true;
            await usage.settle(reservation, output);

            return;
          } catch (error) {
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
              !(error instanceof QuotaExceededError);

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
            notifyFallback(
              config,
              attempts[index + 1]!,
              fallbackError,
              onFallback,
            );
          }
        }
      } finally {
        release();
      }
    },
  };
}
