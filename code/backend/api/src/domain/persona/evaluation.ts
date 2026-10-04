import { z } from 'zod';

const HistorySchema = z.strictObject({
  userText: z.string().max(600),
  generatedText: z.string().max(600),
  dataClass: z.literal('synthetic'),
});

const ScenarioSchema = z.strictObject({
  id: z.string().regex(/^P\d{2}$/),
  category: z.string().max(80),
  text: z.string().min(1).max(4000),
  history: z.array(HistorySchema).max(4),
  expected: z.string().min(1).max(1000),
});

export const PersonaSuiteSchema = z.strictObject({
  version: z.string().max(64),
  source: z.string().max(200),
  cases: z
    .array(ScenarioSchema)
    .length(30)
    .refine(
      (cases) => new Set(cases.map((item) => item.id)).size === 30,
      'IDs duplicados',
    ),
});

export const PersonaDialogueSuiteSchema = PersonaSuiteSchema.extend({
  cases: z
    .array(ScenarioSchema.extend({ id: z.string().regex(/^D\d{2}$/) }))
    .min(1)
    .max(12)
    .refine(
      (cases) => new Set(cases.map((item) => item.id)).size === cases.length,
      'IDs duplicados',
    ),
});

/** Screening is deliberately limited: only a person can judge fidelity and naturalness. */
export function screenPersonaResponse(text: string, metadataValid: boolean) {
  const flags: string[] = [];

  if (!text.trim()) {
    flags.push('empty-response');
  }

  if (!metadataValid) {
    flags.push('expression-fallback');
  }

  if (
    /\b(?:trabalhei|fui ao laboratório|passei o dia|meu dia foi|trabalho no laboratório)\b/iu.test(
      text,
    )
  ) {
    flags.push('possible-invented-physical-activity');
  }

  if (
    /<\/?expression|```|\*[^*]+\*|\{\s*"(?:intent|emotion|intensity)"/iu.test(
      text,
    )
  ) {
    flags.push('structural-leakage');
  }

  return { flags, humanReview: 'pending' as const };
}
