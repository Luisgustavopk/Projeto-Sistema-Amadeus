import type { ProviderConfig, Role } from '../domain/providers/model.ts';

export type UsageSnapshot = {
  day: string;
  requests: number;
  budgetTokens: number;
  reportedInputTokens: number;
  reportedOutputTokens: number;
  estimatedRequests: number;
  limits: ProviderConfig['limits'];
};
export interface ProviderUsageRepository {
  usage(
    owner: string,
    role: Role,
    config: ProviderConfig,
  ): Promise<UsageSnapshot>;
  reserve(
    owner: string,
    role: Role,
    config: ProviderConfig,
    tokens: number,
  ): Promise<string>;
  settle(
    id: string,
    outcome: { inputTokens: number | null; outputTokens: number | null } | null,
  ): Promise<void>;
}
