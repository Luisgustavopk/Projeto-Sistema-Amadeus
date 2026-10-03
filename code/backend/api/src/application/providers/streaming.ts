import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type {
  ProviderFactory,
  ProviderInput,
  ProviderOutput,
} from '../../ports/provider.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';
import { assertProviderCanExecute } from '../../domain/providers/data-policy.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import { validateProviderInput, estimateProviderBudget } from './input.ts';
import {
  providerAttempts,
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
        const attempts = providerAttempts(
          'llm',
          (await configuration.get(ownerId)).llm,
        );

        for (let index = 0; index < attempts.length; index++) {
          signal?.throwIfAborted();
          const config = attempts[index]!;
          assertProviderCanExecute(config, input.dataClass);
          const reservation = await usage.reserve(
            ownerId,
            'llm',
            config,
            estimateProviderBudget(input),
          );
          let settled = false;
          let delivered = false;
          let retry = false;

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

            if (settled || !next || !canUseFallback(error, signal, delivered)) {
              throw error;
            }

            retry = true;
          } finally {
            if (!settled) {
              await usage.settle(reservation, null);
            }
          }

          if (retry) {
            notifyFallback(config, attempts[index + 1]!, onFallback);
          }
        }
      } finally {
        release();
      }
    },
  };
}
