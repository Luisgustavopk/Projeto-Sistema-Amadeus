import { providerAttempts } from './fallback.ts';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type { ProviderFactory } from '../../ports/provider.ts';

export function createProviderQueries(
  configuration: ProviderConfigurationRepository,
  usage: ProviderUsageRepository,
  ownerId: string,
  factory: ProviderFactory,
) {
  return {
    getConfiguration: () => configuration.get(ownerId),
    async describe() {
      const config = await configuration.get(ownerId);

      return Promise.all(
        (['llm', 'stt', 'tts'] as const).map(async (role) => {
          const adapter = factory(role, config[role]);

          return {
            role,
            adapter: config[role].adapter,
            model: config[role].model ?? null,
            dataPolicy: config[role].dataPolicy,
            fallbacks:
              role === 'llm'
                ? [
                    ...(config[role].fallbackModel
                      ? [
                          {
                            adapter: 'gemini' as const,
                            model: config[role].fallbackModel,
                            dataPolicy: 'synthetic-only' as const,
                          },
                        ]
                      : []),
                    ...(config[role].fallbackProviders ?? []).map(
                      ({ adapter, model, dataPolicy }) => ({
                        adapter,
                        model,
                        dataPolicy,
                      }),
                    ),
                  ]
                : [],
            ...(await adapter.health()),
            capabilitySource: 'adapter-reported' as const,
            transport: adapter.transport,
            nativeStreaming: adapter.nativeStreaming,
          };
        }),
      );
    },
    async usage() {
      const config = await configuration.get(ownerId);

      return Promise.all(
        (['llm', 'stt', 'tts'] as const).flatMap((role) =>
          providerAttempts(role, config[role]).map(async (attempt, index) => ({
            role,
            model: attempt.model ?? null,
            isFallback: index > 0,
            ...(await usage.usage(ownerId, role, attempt)),
          })),
        ),
      );
    },
  };
}
