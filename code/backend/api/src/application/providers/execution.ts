import {
  providerAttempts,
  canUseFallback,
  notifyFallback,
  type NotifyProviderFallback,
} from './fallback.ts';
import type { Role } from '../../domain/providers/model.ts';
import { validateProviderInput, estimateProviderBudget } from './input.ts';
import { assertProviderCanExecute } from '../../domain/providers/data-policy.ts';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type {
  ProviderFactory,
  ProviderInput,
  ProviderOutput,
} from '../../ports/provider.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';

export function createProviderExecution(
  configuration: ProviderConfigurationRepository,
  usage: ProviderUsageRepository,
  ownerId: string,
  factory: ProviderFactory,
  gate: ExecutionGate,
  onFallback?: NotifyProviderFallback,
) {
  return {
    async execute(role: Role, input: ProviderInput, signal?: AbortSignal) {
      validateProviderInput(role, input);
      const release = gate.beginExecution();

      try {
        const attempts = providerAttempts(
          role,
          (await configuration.get(ownerId))[role],
        );

        for (let index = 0; index < attempts.length; index++) {
          signal?.throwIfAborted();
          const config = attempts[index]!;
          assertProviderCanExecute(config, input.dataClass);
          const reservation = await usage.reserve(
            ownerId,
            role,
            config,
            estimateProviderBudget(input),
          );
          let result: ProviderOutput;

          try {
            result = await factory(role, config).execute(input, signal);
          } catch (error) {
            await usage.settle(reservation, null);
            const next = attempts[index + 1];

            if (!next || !canUseFallback(error, signal)) {
              throw error;
            }

            notifyFallback(config, next, onFallback);
            continue;
          }

          // Failed persistence must never cause a second model to generate again.
          await usage.settle(reservation, result);

          return result;
        }

        throw new Error('No provider attempt configured.');
      } finally {
        release();
      }
    },
  };
}
