import type { ProviderConfig } from '../../domain/providers/model.ts';
import {
  QuotaExceededError,
  ProviderTemporarilyUnavailableError,
} from '../../domain/errors/providers.ts';

// Shared by buffered and streamed turns of one owner. No prompts or secrets retained.
export function createProviderCooldowns(now: () => number = Date.now) {
  const failures = new Map<
    string,
    {
      until: number;
      error: QuotaExceededError | ProviderTemporarilyUnavailableError;
    }
  >();
  const key = (
    config: ProviderConfig,
    scope: 'model' | 'account' | 'paid' | 'free' = 'model',
  ) =>
    JSON.stringify([
      config.adapter,
      config.apiKeyEnv,
      config.accountId,
      config.endpoint,
      scope === 'model'
        ? config.model
        : scope === 'paid'
          ? 'paid-credit'
          : scope === 'free'
            ? 'free-quota'
            : null,
      scope === 'model' && config.adapter === 'cartesia'
        ? config.voiceId
        : null,
    ]);

  return {
    blocked(config: ProviderConfig) {
      for (const id of [
        key(config),
        key(config, 'account'),
        ...(config.openRouterPaid ? [key(config, 'paid')] : []),
        ...(config.adapter === 'openrouter' && !config.openRouterPaid
          ? [key(config, 'free')]
          : []),
      ]) {
        const failure = failures.get(id);

        if (!failure) {
          continue;
        }

        if (failure.until > now()) {
          return failure.error;
        }

        failures.delete(id);
      }

      return undefined;
    },
    record(config: ProviderConfig, error: unknown, signal?: AbortSignal) {
      if (
        signal?.aborted ||
        !(
          error instanceof QuotaExceededError ||
          error instanceof ProviderTemporarilyUnavailableError
        )
      ) {
        return;
      }

      const duration =
        error.retryAfterMs ??
        (error instanceof QuotaExceededError ? 60000 : 15000);
      failures.set(
        key(
          config,
          config.adapter === 'cartesia' && error instanceof QuotaExceededError
            ? 'account'
            : config.adapter === 'openrouter' &&
                error instanceof QuotaExceededError &&
                (error.quotaScope === 'account' ||
                  error.quotaScope === 'paid' ||
                  error.quotaScope === 'free')
              ? error.quotaScope
              : 'model',
        ),
        { until: now() + duration, error },
      );
    },
    clear(config: ProviderConfig) {
      failures.delete(key(config));
    },
  };
}

export type ProviderCooldowns = ReturnType<typeof createProviderCooldowns>;
