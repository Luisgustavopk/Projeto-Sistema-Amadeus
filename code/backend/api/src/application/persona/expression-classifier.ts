import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type { ProviderFactory, ProviderInput } from '../../ports/provider.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';
import { DEFAULT_PROVIDERS } from '../../domain/providers/model.ts';
import { DataPolicyBlockedError } from '../../domain/errors/providers.ts';
import { createProviderExecution } from '../providers/execution.ts';
import { conversationAuthor } from '../providers/conversation-author.ts';
import { expressionObserverPrompt } from './expression-observer-prompt.ts';
import { ExpressionSchema } from '../../domain/persona/expression.ts';

export type ExpressionObservation = {
  speech: string;
  user: string;
  history: NonNullable<ProviderInput['history']>;
  dataClass: ProviderInput['dataClass'];
  personalConsent: boolean;
};
export type ExpressionClassifier = {
  classify(input: ExpressionObservation, signal: AbortSignal): Promise<unknown>;
};

/** Disabled for personal input unless the owner explicitly opts in. */
export function createExpressionClassifier(dependencies: {
  configuration: ProviderConfigurationRepository;
  usage: ProviderUsageRepository;
  ownerId: string;
  factory: ProviderFactory;
  gate: ExecutionGate;
}): ExpressionClassifier {
  const { configuration, usage, ownerId, factory, gate } = dependencies;
  const execution = createProviderExecution(
    {
      async get() {
        const conversation = (await configuration.get(ownerId)).llm;
        const selected = conversationAuthor(conversation, 'deepseek');
        delete selected.fallbackProviders;
        delete selected.fallbackModel;
        delete selected.localProvider;
        delete selected.localRouting;

        return { ...structuredClone(DEFAULT_PROVIDERS), llm: selected };
      },
      async save() {
        throw new Error('Expression configuration is derived.');
      },
    },
    usage,
    `${ownerId}:expression`,
    factory,
    gate,
    undefined,
    undefined,
    { reserveConversationCapacity: false },
  );

  return {
    async classify(input, signal) {
      // Reject before configuration lookup, accounting, or any remote call.
      if (
        input.dataClass === 'local-only' ||
        (input.dataClass === 'personal' && !input.personalConsent)
      ) {
        throw new DataPolicyBlockedError();
      }

      signal.throwIfAborted();
      const output = await execution.execute(
        'llm',
        {
          content: JSON.stringify({
            speech: input.speech,
            user: input.user,
            history: input.history,
          }),
          systemPrompt: expressionObserverPrompt(true),
          dataClass: input.dataClass,
          purpose: 'expression',
          maxTokens: 160,
        },
        signal,
      );

      return ExpressionSchema.parse(JSON.parse(output.content));
    },
  };
}
