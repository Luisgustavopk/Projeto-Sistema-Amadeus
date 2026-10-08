import { z } from 'zod';
import { contamination, fingerprint } from './diagnostics.ts';
import { prepareEmotionalSuite } from './emotional-suite.ts';

const DepthSuite = z.object({
  version: z.literal('quality-v5-emotional-depth-pt-BR-approved-1'),
  status: z.literal('approved-not-run'),
  synthetic: z.literal(true),
  language: z.literal('pt-BR'),
  cases: z
    .array(
      z.object({
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
          .min(1),
        evaluation: z.object({
          focus: z.string().min(1),
          emotionTargets: z.array(z.string()).min(1),
          references: z.array(z.string()).min(1),
          checks: z.array(z.string()).min(1),
        }),
      }),
    )
    .length(24),
});

/** Only this approved extension accepts variable lengths; historical suites stay frozen. */
export function prepareEmotionalDepth(
  value: unknown,
  previous: unknown,
  documents: string[],
) {
  const suite = DepthSuite.parse(value);
  const old = prepareEmotionalSuite(previous, documents);

  if (
    suite.cases.some(
      (item, index) =>
        item.id !== `PBR${25 + index}` ||
        item.turns.length !== (item.id === 'PBR47' ? 4 : 6),
    )
  ) {
    throw new Error('Sequência aprovada de cenários/turnos divergente.');
  }

  if (contamination(suite.cases, documents).length) {
    throw new Error('Roteiro sobreposto aos exemplos.');
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
    suiteHash: fingerprint(value),
    // New approved depth first, followed by the previously approved regression.
    authorCases: [...authorCases, ...old.authorCases],
    evaluationOnly: [
      ...suite.cases.map(({ id, evaluation }) => ({ id, evaluation })),
      ...old.evaluationOnly,
    ],
    speechReviewBeforeMetadata: true,
    testsAudioOrPresenceScheduler: false,
    semanticVerification: 'pending-independent-review',
  };
}
