import type { ProviderConfig, Role } from '../../domain/providers/model.ts';
import { ProviderTemporarilyUnavailableError } from '../../domain/errors/providers.ts';

export type ProviderFallbackNotice = {
  fromModel: string;
  toModel: string;
  reason: 'PROVIDER_TEMPORARILY_UNAVAILABLE';
};
export type NotifyProviderFallback = (notice: ProviderFallbackNotice) => void;

export function providerAttempts(
  role: Role,
  config: ProviderConfig,
): ProviderConfig[] {
  const { fallbackModel, ...primary } = config;

  if (role !== 'llm' || config.adapter !== 'gemini' || !fallbackModel) {
    return [primary];
  }

  return [primary, { ...primary, model: fallbackModel }];
}

export function canUseFallback(
  error: unknown,
  signal?: AbortSignal,
  delivered = false,
) {
  return (
    !signal?.aborted &&
    !delivered &&
    error instanceof ProviderTemporarilyUnavailableError
  );
}

export function notifyFallback(
  from: ProviderConfig,
  to: ProviderConfig,
  notify?: NotifyProviderFallback,
) {
  notify?.({
    fromModel: from.model!,
    toModel: to.model!,
    reason: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
  });
}
