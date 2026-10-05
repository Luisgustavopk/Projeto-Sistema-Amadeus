import { z } from 'zod';
import { ProviderSchema } from '../providers/model.ts';

export const MemoryExtractorProviderSchema = ProviderSchema.superRefine(
  (p, ctx) => {
    if (p.adapter === 'groq' && p.model !== 'openai/gpt-oss-20b') {
      ctx.addIssue({
        code: 'custom',
        message: 'O perfil gratuito provisório da Groq usa openai/gpt-oss-20b.',
      });
    }

    if (
      ![
        'disabled',
        'groq',
        'openrouter',
        'gemini',
        'openai-local',
        'zai',
      ].includes(p.adapter) ||
      p.fallbackModel ||
      p.fallbackProviders?.length ||
      p.localProvider ||
      p.localRouting ||
      p.voiceId ||
      p.speechFallback
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'O extrator exige um único provedor LLM separado, sem reservas da conversa.',
      });
    }

    if (p.adapter === 'gemini' && p.geminiTier !== 'unpaid') {
      ctx.addIssue({
        code: 'custom',
        message: 'O extrator provisório não habilita Gemini pago.',
      });
    }
  },
);
export const MemoryExtractorConfigurationSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  freeOnly: z.literal(true),
  provider: MemoryExtractorProviderSchema,
  updatedAt: z.iso.datetime().nullable(),
});
export const MemoryExtractorEditSchema =
  MemoryExtractorConfigurationSchema.omit({
    revision: true,
    updatedAt: true,
  }).extend({ expectedRevision: z.number().int().nonnegative() });
export type MemoryExtractorConfiguration = z.infer<
  typeof MemoryExtractorConfigurationSchema
>;
export const MemoryExtractorStatusSchema = z.strictObject({
  configuration: MemoryExtractorConfigurationSchema,
  usage: z.strictObject({
    day: z.string(),
    requests: z.number(),
    budgetTokens: z.number(),
    reportedInputTokens: z.number(),
    reportedOutputTokens: z.number(),
    estimatedRequests: z.number(),
    limits: ProviderSchema.shape.limits,
  }),
});
