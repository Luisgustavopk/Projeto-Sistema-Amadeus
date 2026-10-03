import type { ProvidersConfig } from '../domain/providers/model.ts';

export interface ProviderConfigurationRepository {
  get(ownerId: string): Promise<ProvidersConfig>;
  save(ownerId: string, config: ProvidersConfig): Promise<void>;
}
