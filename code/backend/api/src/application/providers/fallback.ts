import type {
  DataClass,
  ProviderConfig,
  Role,
} from '../../domain/providers/model.ts';
import { providerCanProcessDataClass } from '../../domain/providers/data-policy.ts';
import {
  DataPolicyBlockedError,
  ProviderTemporarilyUnavailableError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';

export type ProviderFallbackNotice = {
  fromProvider: ProviderConfig['adapter'];
  fromModel: string;
  toProvider: ProviderConfig['adapter'];
  toModel: string;
  reason:
    | 'DATA_POLICY_BLOCKED'
    | 'PROVIDER_TEMPORARILY_UNAVAILABLE'
    | 'QUOTA_EXCEEDED';
};
export type NotifyProviderFallback = (notice: ProviderFallbackNotice) => void;

export function providerAttempts(
  role: Role,
  config: ProviderConfig,
): ProviderConfig[] {
  const { fallbackModel, fallbackProviders, ...primary } = config;

  if (role !== 'llm') {
    return [primary];
  }

  const attempts: ProviderConfig[] = [primary];

  if (fallbackModel) {
    attempts.push({
      adapter: 'gemini',
      model: fallbackModel,
      dataPolicy: 'synthetic-only',
      limits: config.limits,
      ...(config.apiKeyEnv ? { apiKeyEnv: config.apiKeyEnv } : {}),
      ...(config.thinkingLevel ? { thinkingLevel: config.thinkingLevel } : {}),
    });
  }

  for (const fallback of fallbackProviders ?? []) {
    attempts.push({ ...fallback, limits: config.limits });
  }

  return attempts;
}

export function filterProviderAttemptsForDataClass(
  attempts: ProviderConfig[],
  dataClass: DataClass,
) {
  return attempts.filter((attempt) =>
    providerCanProcessDataClass(attempt, dataClass),
  );
}

export function canUseFallback(
  error: unknown,
  signal?: AbortSignal,
  delivered = false,
) {
  return (
    !signal?.aborted &&
    !delivered &&
    (error instanceof ProviderTemporarilyUnavailableError ||
      error instanceof QuotaExceededError)
  );
}

export function notifyFallback(
  from: ProviderConfig,
  to: ProviderConfig,
  error: unknown,
  notify?: NotifyProviderFallback,
) {
  notify?.({
    fromProvider: from.adapter,
    fromModel: from.model!,
    toProvider: to.adapter,
    toModel: to.model!,
    reason:
      error instanceof DataPolicyBlockedError
        ? 'DATA_POLICY_BLOCKED'
        : error instanceof QuotaExceededError
          ? 'QUOTA_EXCEEDED'
          : 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });
}
