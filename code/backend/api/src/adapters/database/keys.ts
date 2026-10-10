import { createHash } from 'node:crypto';
import type { Role, ProviderConfig } from '../../domain/providers/model.ts';

export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const providerKey = (role: Role, config: ProviderConfig) =>
  hash(
    JSON.stringify([
      role,
      config.adapter,
      config.endpoint,
      config.adapter === 'openrouter'
        ? config.openRouterPaid
          ? [config.apiKeyEnv, config.model, 'paid']
          : config.apiKeyEnv
        : config.model,
    ]),
  );
