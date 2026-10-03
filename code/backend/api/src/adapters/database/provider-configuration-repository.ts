import type { Client } from '@libsql/client';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import {
  DEFAULT_PROVIDERS,
  ProvidersSchema,
  type ProvidersConfig,
} from '../../domain/providers/model.ts';

export class SqliteProviderConfigurationRepository implements ProviderConfigurationRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async get(owner: string): Promise<ProvidersConfig> {
    const result = await this.client.execute({
      sql: 'SELECT config_json FROM foundation_provider_config WHERE owner_id = ?',
      args: [owner],
    });

    return result.rows[0]
      ? ProvidersSchema.parse(JSON.parse(String(result.rows[0].config_json)))
      : structuredClone(DEFAULT_PROVIDERS);
  }

  async save(owner: string, config: ProvidersConfig) {
    await this.client.execute({
      sql: 'INSERT INTO foundation_provider_config VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET config_json = excluded.config_json',
      args: [owner, JSON.stringify(config)],
    });
  }
}
