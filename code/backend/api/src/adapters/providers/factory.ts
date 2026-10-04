import type { ProviderFactory } from '../../ports/provider.ts';
import { ProviderConfigurationError } from '../../domain/errors/providers.ts';
import { createProvider } from './http-json.ts';
import { createGeminiProvider } from './gemini.ts';
import {
  createCloudflareAiProvider,
  createOpenAiCompatibleProvider,
  createGroqProvider,
} from './openai-compatible.ts';

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

    if (config.adapter === 'openai-local') {
      if (role !== 'llm') {
        throw new ProviderConfigurationError(
          'LLM local só pode responder conversas.',
        );
      }

      return createOpenAiCompatibleProvider(config, secrets);
    }

    if (config.adapter === 'groq' || config.adapter === 'cloudflare-ai') {
      if (role !== 'llm') {
        throw new ProviderConfigurationError(
          'Groq e Cloudflare Workers AI são adaptadores de LLM.',
        );
      }

      return config.adapter === 'groq'
        ? createGroqProvider(config, secrets)
        : createCloudflareAiProvider(config, secrets);
    }

    return createProvider(role, config, secrets);
  };
}
