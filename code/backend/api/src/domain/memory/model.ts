import { z } from 'zod';
import { DataClassSchema, type DataClass } from '../providers/model.ts';
import { MemoryExtractorStatusSchema } from './extractor.ts';

export const MemoryPolicySchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  personalEnabled: z.boolean(),
  autoApprove: z.boolean().default(false),
  extraction: z.enum(['local', 'llm']),
  retentionDays: z.number().int().min(1).max(3650).nullable(),
});
export type MemoryPolicy = z.infer<typeof MemoryPolicySchema>;
export const MemoryPolicyEditSchema = MemoryPolicySchema.omit({
  revision: true,
}).extend({
  autoApprove: z.boolean().optional(),
  expectedRevision: z.number().int().nonnegative(),
  acknowledgeLocalStorage: z.literal(true).optional(),
});
export const RelationSchema = z.strictObject({
  subject: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/[\p{L}\p{N}]/u),
  predicate: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\p{L}\p{N}_ -]+$/u),
  object: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/[\p{L}\p{N}]/u),
});
export type MemoryRelation = z.infer<typeof RelationSchema>;
export const FactInputSchema = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .regex(/[\p{L}\p{N}]/u),
  category: z.enum(['identidade', 'preferencia', 'projeto', 'contexto']),
  dataClass: DataClassSchema,
  permission: z.enum(['local-only', 'eligible']).default('local-only'),
  relation: RelationSchema.nullable().default(null),
  kind: z.enum(['fact', 'event', 'correction']).default('fact'),
  expiresAt: z.number().int().nonnegative().nullable().default(null),
  supersedes: z
    .strictObject({ factId: z.uuid(), version: z.number().int().positive() })
    .nullable()
    .default(null),
});
export type FactInput = z.infer<typeof FactInputSchema>;
export const FactSchema = FactInputSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(['suggested', 'confirmed', 'superseded']),
  origin: z.enum(['user', 'local-extraction', 'llm-extraction']),
  createdAt: z.number(),
  updatedAt: z.number(),
  sources: z.array(
    z.strictObject({
      turnId: z.uuid(),
      conversationId: z.uuid(),
      evidence: z.string(),
      contextValid: z.boolean().optional(),
    }),
  ),
});
export type MemoryFact = z.infer<typeof FactSchema>;
export const SummarySchema = z.strictObject({
  id: z.uuid(),
  conversationId: z.uuid(),
  content: z.string(),
  dataClass: DataClassSchema,
  permission: z.enum(['local-only', 'eligible']),
  version: z.number().int().positive(),
  createdAt: z.number(),
});
export type MemorySummary = z.infer<typeof SummarySchema>;
export type MemorySource = {
  createdAt?: number;
  id: string;
  conversationId: string;
  userText: string;
  assistantConfirmed: string;
  partiallyPlayed: boolean;
  responseStatus: string;
  dataClass: DataClass;
};
export const MemorySourceSchema = z.strictObject({
  createdAt: z.number().optional(),
  id: z.uuid(),
  conversationId: z.uuid(),
  userText: z.string(),
  assistantConfirmed: z.string(),
  partiallyPlayed: z.boolean(),
  responseStatus: z.string(),
  dataClass: DataClassSchema,
});
const ExportRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export const MemoryExportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  exportedAt: z.number(),
  memory_policy: z.array(ExportRowSchema),
  memory_facts: z.array(ExportRowSchema),
  memory_entities: z.array(ExportRowSchema),
  memory_summaries: z.array(ExportRowSchema),
  memory_jobs: z.array(ExportRowSchema),
  memory_tombstones: z.array(ExportRowSchema),
  memory_blocked_turns: z.array(ExportRowSchema),
  foundation_conversations: z.array(ExportRowSchema),
  call_sessions: z.array(ExportRowSchema),
  turns: z.array(ExportRowSchema),
  segments: z.array(ExportRowSchema),
  sources: z.array(ExportRowSchema),
  relations: z.array(ExportRowSchema),
  jobSources: z.array(ExportRowSchema),
  resumptions: z.array(ExportRowSchema),
});
export const MemoryStatusSchema = z.strictObject({
  ranking: z
    .strictObject({
      enabled: z.boolean(),
      model: z.string().nullable(),
      state: z.enum(['disabled', 'idle', 'ready', 'degraded']),
      lastError: z.string().nullable(),
    })
    .optional(),
  search: z.strictObject({
    enabled: z.boolean(),
    model: z.string().nullable(),
    state: z.enum(['disabled', 'idle', 'ready', 'degraded']),
    lastError: z.literal('LOCAL_MODEL_UNAVAILABLE').nullable(),
    indexedFacts: z.number().int().nonnegative(),
  }),
  extractor: MemoryExtractorStatusSchema.optional(),
  policy: MemoryPolicySchema,
  jobs: z.array(
    z.strictObject({
      id: z.uuid(),
      conversationId: z.uuid(),
      status: z.string(),
      attempts: z.number().int(),
      nextRun: z.number(),
      lastError: z.string().nullable(),
    }),
  ),
  measurements: z.strictObject({
    retrievals: z.number(),
    totalRetrievalMs: z.number(),
    lastContextCharacters: z.number(),
    completedJobs: z.number(),
    deferredJobs: z.number(),
  }),
});
export type MemoryJob = {
  id: string;
  attempts: number;
  conversationId: string;
  epoch: number;
  sources: MemorySource[];
};
export type SuggestedFact = Omit<
  FactInput,
  'dataClass' | 'permission' | 'kind' | 'expiresAt' | 'supersedes'
> & {
  kind?: FactInput['kind'];
  validForDays?: number | null | undefined;
  supersedes?: FactInput['supersedes'];
  evidence: { turnId: string; quote: string }[];
};
export const ExtractionSchema = z.strictObject({
  facts: z
    .array(
      FactInputSchema.omit({
        dataClass: true,
        permission: true,
        expiresAt: true,
      }).extend({
        validForDays: z.number().int().min(1).max(365).nullable().optional(),
        evidence: z
          .array(
            z.strictObject({
              turnId: z.uuid(),
              quote: z.string().min(1).max(600),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .max(24),
});

export function normalizeMemory(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function canonicalMemorySubject(subject: string) {
  return /^(eu|(?:o |a )?usuari[oa])$/.test(normalizeMemory(subject))
    ? 'usuário'
    : subject;
}

export function canonicalMemoryRelation(relation: MemoryRelation | null) {
  return relation
    ? { ...relation, subject: canonicalMemorySubject(relation.subject) }
    : null;
}

// Conservative equivalence, not approximate similarity: qualifiers, negative
// claims, events and corrections must remain separate for review.
export function memoryEquivalenceKey(input: FactInput) {
  const relation = canonicalMemoryRelation(input.relation);

  if (
    input.kind !== 'fact' ||
    input.expiresAt !== null ||
    input.supersedes !== null ||
    input.category !== 'preferencia' ||
    relation?.subject !== 'usuário' ||
    relation.predicate !== 'prefere'
  ) {
    return '';
  }

  const value = normalizeMemory(input.text).match(
    /^(?:eu |(?:o |a )?usuari[oa] )?(?:prefiro|prefere|gosto de|gosta de|tenho preferencia por|tem preferencia por) (.+)$/,
  )?.[1];
  const object = normalizeMemory(relation.object);

  return value === object
    ? JSON.stringify(['preferencia', 'usuário', 'prefere', object])
    : '';
}

export function strongestDataClass(classes: DataClass[]): DataClass {
  return classes.includes('local-only')
    ? 'local-only'
    : classes.includes('personal')
      ? 'personal'
      : 'synthetic';
}
