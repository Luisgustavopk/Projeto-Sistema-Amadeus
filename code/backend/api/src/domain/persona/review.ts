import { z } from 'zod';

const rating = z.number().min(1).max(5);
export const PersonaScoresSchema = z.strictObject({
  fidelity: rating,
  naturalness: rating,
  consistency: rating,
  emotion: rating,
  memory: rating,
  speakability: rating,
  honesty: rating,
  identity: rating,
});

export const PersonaReviewSchema = z.object({
  voiceAcceptance: z
    .object({
      source: z.literal('user'),
      approved: z.literal(true),
      approvedAt: z.iso.datetime(),
      reason: z.string().min(1),
    })
    .optional(),
  results: z
    .array(
      z.object({
        id: z.string().regex(/^P(?:0[1-9]|[12]\d|30)$/),
        errorCode: z.string().nullable(),
        scores: PersonaScoresSchema.nullable(),
        disqualifications: z.array(z.string().min(1)).nullable(),
      }),
    )
    .max(30)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
  voiceReview: z
    .strictObject({
      meanQuality: rating,
      intentRecognitionRate: z.number().min(0).max(1),
    })
    .nullable()
    .default(null),
});

export function reviewPersonaReport(input: unknown) {
  const report = PersonaReviewSchema.parse(input);
  const reviewed = report.results.filter(
    (row) => !row.errorCode && row.scores && row.disqualifications !== null,
  );
  const disqualifications = reviewed.flatMap(
    (row) => row.disqualifications ?? [],
  );
  const meanFidelity = reviewed.length
    ? reviewed.reduce((total, row) => total + row.scores!.fidelity, 0) /
      reviewed.length
    : null;
  const meanNaturalness = reviewed.length
    ? reviewed.reduce((total, row) => total + row.scores!.naturalness, 0) /
      reviewed.length
    : null;
  const voicePassed =
    report.voiceAcceptance?.approved === true ||
    (report.voiceReview !== null &&
      report.voiceReview.meanQuality >= 4 &&
      report.voiceReview.intentRecognitionRate >= 0.8);
  const complete =
    reviewed.length === 30 &&
    (report.voiceReview !== null || report.voiceAcceptance !== undefined);
  const passed =
    complete &&
    disqualifications.length === 0 &&
    meanFidelity! >= 4 &&
    meanNaturalness! >= 4 &&
    voicePassed;

  return {
    status: disqualifications.length
      ? 'rejected'
      : complete
        ? passed
          ? 'passed'
          : 'rejected'
        : 'pending',
    reviewedScenarios: reviewed.length,
    meanFidelity,
    meanNaturalness,
    disqualifications,
    voiceReview: report.voiceReview,
    voiceAcceptance: report.voiceAcceptance ?? null,
  };
}
