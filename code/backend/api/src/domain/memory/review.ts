import { z } from 'zod';
import { ExtractionSchema } from './model.ts';

export const MemoryReviewSchema = z.strictObject({
  facts: z
    .array(
      ExtractionSchema.shape.facts.element.extend({
        support: z.enum(['full', 'partial', 'none']),
        contextPreserved: z.boolean(),
        context: z.string().trim().min(1).max(200).nullable(),
        sourceMode: z.enum([
          'asserted',
          'hypothetical',
          'fictional',
          'uncertain',
        ]),
      }),
    )
    .max(24),
});

const target = z.strictObject({
  factId: z.uuid(),
  version: z.number().int().positive(),
});

export const ReconciliationSchema = z.strictObject({
  links: z
    .array(
      z.strictObject({
        index: z.number().int().min(0).max(23),
        supersedes: target.nullable(),
        duplicateOf: target.nullable(),
      }),
    )
    .max(24),
});

export const MemoryAnswerSchema = z.strictObject({
  status: z.enum(['answerable', 'unknown', 'unrelated']),
  claims: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(600),
        factIds: z.array(z.uuid()).min(1).max(12),
      }),
    )
    .max(12),
});
export type MemoryAnswer = z.infer<typeof MemoryAnswerSchema>;
export const MemorySpeechReviewSchema = z.strictObject({
  verdict: z.enum(['supported', 'unsupported', 'uncertain', 'unrelated']),
});
