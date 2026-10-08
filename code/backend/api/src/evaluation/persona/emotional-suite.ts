import { z } from 'zod';
import { contamination, fingerprint } from './diagnostics.ts';

const verdict = z.enum(['aprova', 'reprova', 'incerto', 'não aplicável']);
export const EmotionalReviewSchema = z.object({
  evaluatorKind: z.enum(['human', 'agent', 'external-model']),
  personallyReviewed: z.boolean(),
  speech: z.record(
    z.string(),
    z.object({ verdict, reason: z.string().min(1) }),
  ),
  // Fill this only after judging the speech with metadata hidden.
  metadata: z.object({ verdict, reason: z.string().min(1) }).nullable(),
});

const caseSchema = z
  .object({
    id: z.string().regex(/^PBR\d{2}$/u),
    domain: z.string().min(1),
    facts: z.array(z.string()),
    history: z
      .array(
        z.object({
          userText: z.string(),
          generatedText: z.string(),
          sentText: z.string().optional(),
          dataClass: z.literal('synthetic'),
          responseStatus: z.literal('completed'),
          partiallyPlayed: z.literal(false),
        }),
      )
      .optional(),
    turns: z
      .array(
        z.union([
          z.string().min(1),
          z.object({ initiativeKind: z.literal('initiative') }),
        ]),
      )
      .length(4),
    expectation: z.string().min(1),
    evaluation: z.object({
      references: z.array(z.string()).min(1),
      focus: z.string().min(1),
      turnChecks: z.array(z.string().min(1)).length(4),
    }),
  })
  .passthrough();

export const EmotionalSuiteSchema = z
  .object({
    version: z.string(),
    synthetic: z.literal(true),
    language: z.literal('pt-BR'),
    status: z.literal('prepared-not-run'),
    references: z.record(z.string(), z.string()),
    cases: z.array(caseSchema).min(1),
  })
  .passthrough()
  .superRefine((suite, ctx) => {
    if (
      new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cenários emocionais duplicados.',
      });
    }
  });

/** Local preparation only. Neither grading criteria nor target replies reach an author. */
export function prepareEmotionalSuite(
  value: unknown,
  promptDocuments: string[],
) {
  const suite = EmotionalSuiteSchema.parse(value);
  const overlaps = contamination(suite.cases, promptDocuments);

  if (overlaps.length) {
    throw new Error('Sobreposição entre roteiro e exemplos do prompt.');
  }

  const authorCases = suite.cases.map(
    ({ id, domain, facts, history, turns }) => ({
      id,
      domain,
      facts,
      ...(history ? { history } : {}),
      turns,
    }),
  );

  return {
    suiteHash: fingerprint(suite),
    plannedTurnsPerModel: authorCases.reduce(
      (sum, item) => sum + item.turns.length,
      0,
    ),
    authorCases,
    evaluationOnly: suite.cases.map(({ id, expectation, evaluation }) => ({
      id,
      expectation,
      evaluation,
    })),
    semanticVerification: 'pending-independent-review',
    speechReviewBeforeMetadata: true,
    testsAudioOrPresenceScheduler: false,
  };
}
