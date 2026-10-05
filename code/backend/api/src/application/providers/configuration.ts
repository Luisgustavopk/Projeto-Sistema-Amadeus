import {
  ProvidersSchema,
  type ProvidersConfig,
} from '../../domain/providers/model.ts';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderFactory } from '../../ports/provider.ts';
import type { ConfigurationGate } from '../../ports/activity-gate.ts';
import { configuredProviderAttempts } from './routing.ts';

export function createProviderConfiguration(
  repository: ProviderConfigurationRepository,
  ownerId: string,
  factory: ProviderFactory,
  gate: ConfigurationGate,
) {
  return {
    async configureTts(
      tts: ProvidersConfig['tts'],
      verify?: () => Promise<void>,
    ) {
      const release = gate.beginConfiguration();

      try {
        await verify?.();
        const current = await repository.get(ownerId);
        const config = ProvidersSchema.parse({ ...current, tts });

        for (const attempt of configuredProviderAttempts('tts', config.tts)) {
          factory('tts', attempt);
        }

        await repository.save(ownerId, config);

        return config;
      } finally {
        release();
      }
    },
    async configure(input: ProvidersConfig) {
      const release = gate.beginConfiguration();

      try {
        const config = ProvidersSchema.parse(input);

        for (const role of ['llm', 'stt', 'tts'] as const) {
          for (const attempt of configuredProviderAttempts(
            role,
            config[role],
          )) {
            factory(role, attempt);
          }
        }

        await repository.save(ownerId, config);

        return config;
      } finally {
        release();
      }
    },
  };
}
