import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ProviderServices } from '../providers/index.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import { ExtractionSchema, RelationSchema } from '../../domain/memory/model.ts';
import type {
  MemoryFact,
  MemorySource,
  SuggestedFact,
} from '../../domain/memory/model.ts';
import {
  MemoryAnswerSchema,
  MemoryReviewSchema,
  MemorySpeechReviewSchema,
  ReconciliationSchema,
} from '../../domain/memory/review.ts';
import {
  MEMORY_EXTRACTION_PROMPT,
  parseMemoryExtraction,
} from './extraction.ts';

function prompt(file: string) {
  const value = readFileSync(new URL(file, import.meta.url), 'utf8').trim();

  if (!value || value.length > 12000) {
    throw new Error('Direção de revisão inválida.');
  }

  return value;
}

export const MEMORY_REVIEW_PROMPT = prompt('./memory-review-v1.md');
export const MEMORY_RECONCILE_PROMPT = prompt('./memory-reconcile-v1.md');
export const MEMORY_ANSWER_PROMPT = prompt('./memory-answer-v1.md');
const MEMORY_SPEECH_REVIEW_PROMPT = prompt('./memory-speech-review-v1.md');

type Execution = Pick<ProviderServices, 'execute'>;

export async function extractReviewedMemory(
  providers: Execution,
  current: MemorySource[],
  previous: MemorySource[],
  known: MemoryFact[],
  dataClass: DataClass,
  signal: AbortSignal,
) {
  const wire = (source: MemorySource) => ({
    turnId: source.id,
    createdAt: source.createdAt,
    userText: source.userText,
    assistantConfirmed: source.assistantConfirmed.slice(0, 200),
    assistantTruncated: source.assistantConfirmed.length > 200,
  });
  const sources = {
    currentSources: current.map(wire),
    previousSources: previous.map(wire),
  };

  const execute = async (
    task: 'extract' | 'review' | 'reconcile',
    systemPrompt: string,
    data: unknown,
  ) => {
    signal.throwIfAborted();
    const output = await providers.execute(
      'llm',
      {
        content: JSON.stringify(data),
        systemPrompt,
        dataClass,
        purpose: 'memory',
        memoryTask: task,
        maxTokens: task === 'reconcile' ? 1200 : 4096,
      },
      signal,
    );
    signal.throwIfAborted();

    return output.content;
  };

  // Neither drafting nor semantic review sees existing interpretations.
  // Failure of any stage leaves the job pending; nothing is auto-approved.
  let draft: SuggestedFact[];

  try {
    draft = ExtractionSchema.parse(
      JSON.parse(await execute('extract', MEMORY_EXTRACTION_PROMPT, sources)),
    ).facts;
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new ProviderInvalidError('Rascunho de memória fora do contrato.');
    }

    throw error;
  }

  const reviewOutput = await execute('review', MEMORY_REVIEW_PROMPT, {
    ...sources,
    proposals: draft.map(({ evidence, ...fact }) => ({
      ...fact,
      sourceIds: evidence.map((e) => e.turnId),
    })),
  });
  let accepted;

  try {
    const evaluation = MemoryReviewSchema.parse(JSON.parse(reviewOutput));
    accepted = evaluation.facts
      .filter(
        (f) =>
          f.support === 'full' &&
          f.contextPreserved &&
          f.sourceMode === 'asserted',
      )
      .map((fact) =>
        ExtractionSchema.shape.facts.element.strip().parse({
          ...fact,
          text: fact.context ? `${fact.text} (${fact.context})` : fact.text,
        }),
      );
  } catch {
    throw new ProviderInvalidError(
      'A revisão semântica não corresponde ao contrato.',
    );
  }

  const reviewed = parseMemoryExtraction(
    JSON.stringify({ facts: accepted }),
    [...previous, ...current],
    current,
  );

  if (!reviewed.length || !known.length) {
    return reviewed;
  }

  const content = await execute('reconcile', MEMORY_RECONCILE_PROMPT, {
    facts: reviewed,
    existingFacts: known.map(
      ({ id, version, text, kind, relation, expiresAt }) => ({
        id,
        version,
        text,
        kind,
        relation,
        expiresAt,
      }),
    ),
    ...sources,
  });

  return reconcileReviewedMemory(content, reviewed, known);
}

export function reconcileReviewedMemory(
  content: string,
  reviewed: SuggestedFact[],
  known: MemoryFact[],
) {
  try {
    const { links } = ReconciliationSchema.parse(JSON.parse(content));
    const indices = new Set<number>();
    const result = reviewed.map((fact) => ({ ...fact }));
    const duplicates = new Set<number>();

    for (const link of links) {
      if (
        link.index >= result.length ||
        indices.has(link.index) ||
        (link.supersedes && link.duplicateOf)
      ) {
        throw new Error('Invalid link');
      }

      indices.add(link.index);
      const target = link.supersedes ?? link.duplicateOf;

      if (
        target &&
        !known.some(
          (f) =>
            f.id === target.factId &&
            f.version === target.version &&
            f.status === 'confirmed',
        )
      ) {
        throw new Error('Stale target');
      }

      if (link.supersedes) {
        result[link.index] = {
          ...result[link.index]!,
          kind: 'correction',
          supersedes: link.supersedes,
        };
      }

      if (link.duplicateOf) {
        duplicates.add(link.index);
      }
    }

    return result.filter((_, index) => !duplicates.has(index));
  } catch {
    throw new ProviderInvalidError(
      'A reconciliação de memória não corresponde às versões conhecidas.',
    );
  }
}

// This is a separate reasoning plan, not a second persona prompt. Only the
// selected, permitted fact snapshot is exposed; no original conversations.
const SelectedMemorySchema = z.object({
  facts: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.number().int().positive(),
        text: z.string(),
        relation: RelationSchema.nullable().optional(),
        kind: z.enum(['fact', 'event', 'correction']).optional(),
        expiresAt: z.number().nullable().optional(),
        dataClass: z.enum(['personal', 'synthetic', 'local-only']),
      }),
    )
    .max(12),
});

export async function planMemoryAnswer(
  providers: Execution,
  memories: string,
  question: string,
  dataClass: DataClass,
  signal: AbortSignal,
  recent: { user: string; assistantConfirmed: string }[] = [],
) {
  const snapshot = SelectedMemorySchema.parse(JSON.parse(memories));

  if (
    snapshot.facts.some(
      (f) =>
        (dataClass !== 'local-only' && f.dataClass === 'local-only') ||
        (dataClass === 'synthetic' && f.dataClass === 'personal'),
    )
  ) {
    throw new ProviderInvalidError('Classe de memória incompatível.');
  }

  if (!snapshot.facts.length) {
    return { status: 'unknown' as const, claims: [] };
  }

  const output = await providers.execute(
    'llm',
    {
      content: JSON.stringify({
        question,
        recent: recent.slice(-2).map((turn) => ({
          user: turn.user.slice(0, 400),
          assistantConfirmed: turn.assistantConfirmed.slice(0, 400),
        })),
        facts: snapshot.facts,
      }),
      systemPrompt: MEMORY_ANSWER_PROMPT,
      dataClass,
      purpose: 'memory',
      memoryTask: 'answer',
      maxTokens: 1200,
    },
    signal,
  );
  signal.throwIfAborted();

  return parseMemoryAnswer(
    output.content,
    snapshot.facts.map((f) => f.id),
  );
}

export function parseMemoryAnswer(content: string, ids: string[]) {
  try {
    const result = MemoryAnswerSchema.parse(JSON.parse(content));

    if (
      (result.status === 'answerable') !== Boolean(result.claims.length) ||
      result.claims.some((c) => c.factIds.some((id) => !ids.includes(id)))
    ) {
      throw new Error('Unsupported plan');
    }

    return result;
  } catch {
    throw new ProviderInvalidError(
      'O plano de resposta cita memória ausente ou viola o contrato.',
    );
  }
}

export async function verifyMemorySpeech(
  providers: Execution,
  memories: string,
  question: string,
  reply: string,
  dataClass: DataClass,
  signal: AbortSignal,
  recent: { user: string; assistantConfirmed: string }[] = [],
) {
  const { facts } = SelectedMemorySchema.parse(JSON.parse(memories));
  const output = await providers.execute(
    'llm',
    {
      content: JSON.stringify({
        question,
        reply,
        facts,
        recent: recent.slice(-2).map((turn) => ({
          user: turn.user.slice(0, 400),
          assistantConfirmed: turn.assistantConfirmed.slice(0, 400),
        })),
      }),
      systemPrompt: MEMORY_SPEECH_REVIEW_PROMPT,
      purpose: 'memory',
      memoryTask: 'verify-answer',
      dataClass,
      maxTokens: 800,
    },
    signal,
  );
  signal.throwIfAborted();
  const { verdict } = MemorySpeechReviewSchema.parse(
    JSON.parse(output.content),
  );

  return verdict === 'supported' || verdict === 'unrelated';
}
