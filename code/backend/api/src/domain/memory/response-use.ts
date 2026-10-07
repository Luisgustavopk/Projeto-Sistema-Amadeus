import { z } from 'zod';

/** Indices refer only to the permitted facts supplied for this generation. */
const MemoryResponseObjectSchema = z.discriminatedUnion('use', [
  z.strictObject({ use: z.literal('none'), facts: z.array(z.never()).max(0) }),
  z.strictObject({
    use: z.literal('recall'),
    facts: z.array(z.number().int().min(0).max(11)).min(1).max(12),
  }),
]);
export const MemoryResponseUseSchema = z
  .union([
    MemoryResponseObjectSchema,
    z.array(z.number().int().min(0).max(11)).max(12),
  ])
  .transform((value) =>
    Array.isArray(value)
      ? value.length
        ? { use: 'recall' as const, facts: value }
        : { use: 'none' as const, facts: [] }
      : value,
  );
export type MemoryResponseUse = z.infer<typeof MemoryResponseUseSchema>;
