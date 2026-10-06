import { z } from 'zod';
import { ExtractionSchema, RelationSchema } from './model.ts';
import {
  ReconciliationSchema,
  MemoryAnswerSchema,
  MemorySpeechReviewSchema,
} from './review.ts';

// Strict decoding requires every field, including nullable fields. The full
// local schema and literal evidence validation remain authoritative.
const fact = ExtractionSchema.shape.facts.element;
const relation = RelationSchema.extend({
  subject: z.string().min(1).max(120),
  predicate: z.string().min(1).max(64),
  object: z.string().min(1).max(120),
});
const output = z.strictObject({
  facts: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(600),
        category: fact.shape.category,
        kind: z.enum(['fact', 'event', 'correction']),
        relation: relation.nullable(),
        supersedes: z
          .strictObject({
            factId: z.string().uuid(),
            version: z.number().int().positive(),
          })
          .nullable(),
        validForDays: z.number().int().min(1).max(365).nullable(),
        evidence: fact.shape.evidence,
      }),
    )
    .max(24),
});

export const MEMORY_OUTPUT_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'amadeus_memory',
    strict: true,
    schema: z.toJSONSchema(output),
  },
};

export function memoryOutputFormat(task?: string) {
  const schema =
    task === 'reconcile'
      ? ReconciliationSchema
      : task === 'verify-answer'
        ? MemorySpeechReviewSchema
        : task === 'answer'
          ? MemoryAnswerSchema
          : undefined;

  if (task === 'review') {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'amadeus_memory_review',
        strict: true,
        schema: z.toJSONSchema(
          z.strictObject({
            facts: z
              .array(
                output.shape.facts.element.extend({
                  support: z.enum(['full', 'partial', 'none']),
                  contextPreserved: z.boolean(),
                  context: z.string().min(1).max(200).nullable(),
                  sourceMode: z.enum([
                    'asserted',
                    'hypothetical',
                    'fictional',
                    'uncertain',
                  ]),
                }),
              )
              .max(24),
          }),
        ),
      },
    };
  }

  return schema
    ? {
        type: 'json_schema',
        json_schema: {
          name: `amadeus_memory_${task}`,
          strict: true,
          schema: z.toJSONSchema(schema),
        },
      }
    : MEMORY_OUTPUT_FORMAT;
}
