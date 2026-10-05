import { z } from 'zod';
import { ExtractionSchema, RelationSchema } from './model.ts';

// Strict decoding requires every field, including nullable fields. The full
// local schema and literal evidence validation remain authoritative.
const fact = ExtractionSchema.shape.facts.element;
const relation = RelationSchema.extend({
  subject: z.string().min(1).max(120),
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
    .max(12),
});

export const MEMORY_OUTPUT_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'amadeus_memory',
    strict: true,
    schema: z.toJSONSchema(output),
  },
};
