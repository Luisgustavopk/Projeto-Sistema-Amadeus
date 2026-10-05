import {
  filterProviderAttemptsForDataClass,
  canUseFallback,
  notifyFallback,
  type NotifyProviderFallback,
} from './fallback.ts';
import {
  createProviderCooldowns,
  type ProviderCooldowns,
} from './cooldowns.ts';
import { selectProviderAttempts } from './routing.ts';
import type { Role } from '../../domain/providers/model.ts';
import { validateProviderInput, estimateProviderBudget } from './input.ts';
import { assertProviderCanExecute } from '../../domain/providers/data-policy.ts';
import {
  DataPolicyBlockedError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';
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
  cooldowns: ProviderCooldowns = createProviderCooldowns(),
) {
  return {
    async execute(role: Role, input: ProviderInput, signal?: AbortSignal) {
      validateProviderInput(role, input);
      const release = gate.beginExecution();

      try {
        const providerConfig = (await configuration.get(ownerId))[role];
        const configuredAttempts = selectProviderAttempts(
          role,
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

        for (let index = 0; index < attempts.length; index++) {
          signal?.throwIfAborted();
          const config = attempts[index]!;
          assertProviderCanExecute(config, input.dataClass);
          const blocked =
            role === 'llm' ? cooldowns.blocked(config) : undefined;

          if (blocked) {
            const next = attempts[index + 1];

            if (!next) {
              throw blocked;
            }

            notifyFallback(config, next, blocked, onFallback);
            continue;
          }

          let reservation: string;

          try {
            reservation = await usage.reserve(
              ownerId,
              role,
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

          let result: ProviderOutput;

          try {
            result = await factory(role, config).execute(input, signal);
          } catch (error) {
            if (role === 'llm') {
              cooldowns.record(config, error, signal);
            }

            await usage.settle(reservation, null);
            const next = attempts[index + 1];

            if (!next || !canUseFallback(error, signal)) {
              throw error;
            }

            notifyFallback(config, next, error, onFallback);
            continue;
          }

          // Failed persistence must never cause a second model to generate again.
          await usage.settle(reservation, result);

          if (role === 'llm') {
            cooldowns.clear(config);
          }

          return result;
        }

        throw new Error('No provider attempt configured.');
      } finally {
        release();
      }
    },
  };
}
