import { QuotaExceededError } from '../errors/providers.ts';
import type { ProviderConfig } from './model.ts';

export function assertBudgetAvailable(
  limits: ProviderConfig['limits'],
  usage: { requests: number; tokens: number },
  requestedTokens: number,
) {
  if (limits.enforced === false) {
    return;
  }

  if (
    usage.requests >= limits.requestsPerDay ||
    usage.tokens + requestedTokens > limits.tokensPerDay
  ) {
    throw new QuotaExceededError();
  }
}
