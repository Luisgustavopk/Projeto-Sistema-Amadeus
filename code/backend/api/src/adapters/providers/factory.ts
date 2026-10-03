import type { ProviderFactory } from '../../ports/provider.ts';
import { ProviderConfigurationError } from '../../domain/errors/providers.ts';
import { createProvider } from './http-json.ts';
import { createGeminiProvider } from './gemini.ts';

export function createProviderFactory(
  secrets: NodeJS.ProcessEnv,
): ProviderFactory {
  return (role, config) => {
    if (config.adapter === 'gemini') {
      if (role !== 'llm') {
        throw new ProviderConfigurationError(
          'Gemini é o adaptador do LLM nesta fase.',
        );
      }

      return createGeminiProvider(config, secrets);
    }

    return createProvider(role, config, secrets);
  };
}
