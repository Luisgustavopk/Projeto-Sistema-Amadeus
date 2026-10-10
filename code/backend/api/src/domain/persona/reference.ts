import { z } from 'zod';
import { createHash } from 'node:crypto';

export const ReferenceProvenanceSchema = z.strictObject({
  sourceId: z.string().min(1),
  repository: z.literal('https://github.com/FrancescoCaracciolo/Amadeus'),
  revision: z.literal('9d4726bd37dce9919af37904e442e49205f329b8'),
  file: z.string().min(1),
  url: z.string().url(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().positive().optional(),
});

export const PersonaReferenceSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/u),
    kind: z.enum(['style', 'lore', 'lore-source']),
    reviewed: z.boolean(),
    sceneGroup: z.string().min(1),
    situation: z.string().min(1).max(600),
    sceneContext: z.string().min(1).max(1200),
    adaptationNote: z.string().min(1).max(1200),
    direction: z.string().min(1).max(600),
    dialogue: z
      .array(
        z.strictObject({
          role: z.enum(['user', 'assistant']),
          content: z.string().min(1).max(1200),
        }),
      )
      .max(8)
      .default([]),
    text: z.string().max(6000).default(''),
    chronology: z.enum(['style-only', 'posterior-or-unverified']),
    autobiographicalEligible: z.literal(false),
    provenance: z.array(ReferenceProvenanceSchema).min(1),
    directionSources: z
      .array(
        z.strictObject({
          file: z.string().min(1),
          hash: z.string().regex(/^[a-f0-9]{64}$/u),
          sections: z
            .array(
              z.strictObject({
                heading: z.string().min(1),
                lineStart: z.number().int().positive(),
                lineEnd: z.number().int().positive(),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  })
  .superRefine((entry, context) => {
    if (
      entry.kind === 'style' &&
      (!entry.reviewed ||
        entry.chronology !== 'style-only' ||
        entry.dialogue.length < 2 ||
        entry.dialogue.some(
          (message, index) =>
            message.role !== (index % 2 ? 'assistant' : 'user'),
        ))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Exemplo de atuação sem curadoria ou alternância válida.',
      });
    }

    if (
      entry.kind !== 'style' &&
      (!entry.text ||
        entry.dialogue.length ||
        entry.chronology !== 'posterior-or-unverified')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Conhecimento ficcional sem texto ou cronologia válida.',
      });
    }

    if (entry.kind === 'lore-source' && entry.reviewed) {
      context.addIssue({
        code: 'custom',
        message: 'Fonte bruta não pode se declarar revisada.',
      });
    }
  });

export const ReferenceCatalogSchema = z
  .strictObject({
    version: z.literal(1),
    curatedBy: z.literal('editorial-adaptation-unvalidated-by-user'),
    sourceMarkdownHash: z.string().regex(/^[a-f0-9]{64}$/u),
    entries: z.array(PersonaReferenceSchema).min(1).max(100),
  })
  .superRefine((catalog, context) => {
    if (
      new Set(catalog.entries.map((entry) => entry.id)).size !==
      catalog.entries.length
    ) {
      context.addIssue({ code: 'custom', message: 'Referências duplicadas.' });
    }
  });

export type PersonaReference = z.infer<typeof PersonaReferenceSchema>;
export const referenceHash = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export const referencePassage = (entry: PersonaReference) =>
  entry.kind === 'style'
    ? `${entry.situation}\n${entry.direction}`
    : `${entry.situation}\n${entry.text}`;
