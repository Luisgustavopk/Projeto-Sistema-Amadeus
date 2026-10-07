import { z } from 'zod';

export const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';

export const ToneSchema = z.enum([
  'neutral',
  'frustration',
  'distress',
  'urgency',
  'playful',
  'enthusiasm',
  'uncertain',
]);
export type PersonaTone = z.infer<typeof ToneSchema>;

export const PersonaAnalysisConfigurationSchema = z
  .strictObject({
    enabled: z.boolean().default(false),
    timeoutMs: z.number().int().min(100).max(2500).default(600),
    clarityTimeoutMs: z.number().int().min(100).max(2500).default(1000),
    memoryReviewTimeoutMs: z.number().int().min(100).max(4000).default(2000),
    memoryReviewMode: z.enum(['strict', 'selective']).default('selective'),
    minimumConfidence: z.number().min(0.5).max(1).default(0.7),
    requestsPerDay: z.number().int().min(0).max(1000).default(100),
    tokensPerDay: z.number().int().min(0).max(1000000).default(200000),
    dataPolicy: z
      .enum(['synthetic-only', 'personal-approved'])
      .default('synthetic-only'),
    policyReviewedAt: z.iso.datetime().optional(),
    policyReference: z.string().url().optional(),
  })
  .superRefine((config, ctx) => {
    if (
      config.dataPolicy === 'personal-approved' &&
      (!config.policyReviewedAt || !config.policyReference)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Análise pessoal exige revisão e referência da política.',
      });
    }
  });
export type PersonaAnalysisConfiguration = z.infer<
  typeof PersonaAnalysisConfigurationSchema
>;
