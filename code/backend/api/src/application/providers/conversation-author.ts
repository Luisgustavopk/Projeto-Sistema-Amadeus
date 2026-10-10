import {
  ProviderSchema,
  type ProviderConfig,
} from '../../domain/providers/model.ts';
import {
  LLAMA_REFINEMENT_MODEL,
  DEEPSEEK_REFINEMENT_MODEL,
} from '../../domain/providers/openrouter.ts';
import { ProviderConfigurationError } from '../../domain/errors/providers.ts';

/** Explicit operator selection, never a paid fallback or a semantic router. */
export function conversationAuthor(
  current: ProviderConfig,
  author: 'llama' | 'deepseek',
): ProviderConfig {
  if (current.adapter !== 'openrouter' || !current.openRouterPaid) {
    throw new ProviderConfigurationError(
      'Configure o acesso pago do OpenRouter antes de escolher o autor.',
    );
  }

  return ProviderSchema.parse({
    ...current,
    model:
      author === 'llama' ? LLAMA_REFINEMENT_MODEL : DEEPSEEK_REFINEMENT_MODEL,
    openRouterPaid:
      author === 'llama'
        ? { maxPromptPrice: 0.1, maxCompletionPrice: 0.32 }
        : { maxPromptPrice: 0.14, maxCompletionPrice: 0.42 },
  });
}
