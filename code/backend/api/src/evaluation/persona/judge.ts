import { z } from 'zod';

export const judgeCriteria = [
  'interlocution',
  'proportionality',
  'grounding',
  'continuity',
  'persona',
  'questions',
  'recommendations',
  'canon',
] as const;
const check = z
  .strictObject({
    applicable: z.boolean(),
    pass: z.boolean().nullable(),
    evidence: z.string().min(1).max(600),
  })
  .refine(
    (item) => item.applicable || item.pass === null,
    'Critério não aplicável deve usar pass:null.',
  );
export const VerdictSchema = z.strictObject({
  checks: z.strictObject({
    interlocution: check,
    proportionality: check,
    grounding: check,
    continuity: check,
    persona: check,
    questions: check,
    recommendations: check,
    canon: check,
  }),
  summary: z.string().max(240),
});

export function parseVerdict(text: string) {
  const value = JSON.parse(text) as { checks?: unknown; summary?: unknown };

  // Normalize only representation. Missing or duplicated criteria stay invalid.
  if (Array.isArray(value.checks)) {
    const entry = z.strictObject({
      criterion: z.enum(judgeCriteria),
      applicable: z.boolean(),
      pass: z.boolean().nullable(),
      evidence: z.string(),
    });
    const entries = z
      .array(entry)
      .length(judgeCriteria.length)
      .parse(value.checks);

    if (
      new Set(entries.map((item) => item.criterion)).size !==
      judgeCriteria.length
    ) {
      throw new Error('Critérios duplicados.');
    }

    value.checks = Object.fromEntries(
      entries.map(({ criterion, ...item }) => [criterion, item]),
    );
  }

  return VerdictSchema.parse(value);
}

export function calibrationAgreement(
  pairs: {
    automatic: z.infer<typeof VerdictSchema>;
    human: z.infer<typeof VerdictSchema> | null;
  }[],
) {
  return Object.fromEntries(
    judgeCriteria.map((criterion) => {
      let agreements = 0,
        disagreements = 0,
        unavailable = 0,
        falseApproval = 0,
        falseRejection = 0;

      for (const pair of pairs) {
        const human = pair.human?.checks[criterion];
        const automatic = pair.automatic.checks[criterion];

        if (
          !human ||
          !human.applicable ||
          !automatic.applicable ||
          human.pass === null ||
          automatic.pass === null
        ) {
          unavailable++;
          continue;
        }

        if (human.pass === automatic.pass) {
          agreements++;
        } else {
          disagreements++;

          if (automatic.pass) {
            falseApproval++;
          } else {
            falseRejection++;
          }
        }
      }

      const compared = agreements + disagreements;

      return [
        criterion,
        {
          agreements,
          disagreements,
          unavailable,
          falseApproval,
          falseRejection,
          compared,
          agreement: compared ? agreements / compared : null,
        },
      ];
    }),
  );
}
