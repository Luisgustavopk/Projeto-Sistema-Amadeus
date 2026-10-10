import {
  ProvidersSchema,
  type ProvidersConfig,
} from '../../domain/providers/model.ts';
import { LLAMA_REFINEMENT_MODEL } from '../../domain/providers/openrouter.ts';
import { providerAttempts } from './fallback.ts';

export function buildLlamaRefinement(
  current: ProvidersConfig,
  reviewedAt = new Date().toISOString(),
) {
  const attempts = providerAttempts('llm', current.llm);
  const reserves = attempts
    .filter(
      (p) =>
        ['groq', 'cloudflare-ai', 'gemini', 'mistral', 'openrouter'].includes(
          p.adapter,
        ) &&
        !p.openRouterPaid &&
        !(p.adapter === 'gemini' && p.geminiTier === 'paid') &&
        (p.adapter !== 'openrouter' || p.model?.endsWith(':free')),
    )
    .sort((a, b) => {
      const priority = (p: typeof a) =>
        p.adapter === 'openrouter'
          ? 1
          : p.adapter === 'gemini' && p.dataPolicy === 'synthetic-only'
            ? 2
            : 0;

      return priority(a) - priority(b);
    })
    .map(
      ({
        adapter,
        model,
        apiKeyEnv,
        limits,
        dataPolicy,
        policyReviewedAt,
        policyReference,
        accountId,
        geminiTier,
      }) => ({
        adapter,
        model,
        apiKeyEnv,
        limits,
        dataPolicy,
        policyReviewedAt,
        policyReference,
        accountId,
        geminiTier,
      }),
    );

  if (!reserves.length || reserves.length > 8) {
    throw new Error(
      'Configure de uma a oito reservas gratuitas antes do refinamento.',
    );
  }

  return ProvidersSchema.parse({
    ...current,
    llm: {
      adapter: 'openrouter',
      model: LLAMA_REFINEMENT_MODEL,
      apiKeyEnv: 'OPENROUTER_API_KEY',
      openRouterPaid: { maxPromptPrice: 0.15, maxCompletionPrice: 0.4 },
      limits: {
        ...(current.llm.openRouterPaid && current.llm.limits.enforced === false
          ? { enforced: false }
          : {}),
        requestsPerDay: 100,
        tokensPerDay: 1000000,
        source: 'operator',
      },
      dataPolicy: 'personal-approved',
      policyReviewedAt: reviewedAt,
      policyReference: 'https://openrouter.ai/privacy',
      fallbackProviders: reserves,
      ...(current.llm.localProvider
        ? {
            localProvider: current.llm.localProvider,
            localRouting: 'cloud-first',
          }
        : {}),
    },
  });
}
