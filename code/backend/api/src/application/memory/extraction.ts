import {
  ExtractionSchema,
  type MemorySource,
  type SuggestedFact,
} from '../../domain/memory/model.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import { readFileSync } from 'node:fs';
import type { MemoryFact } from '../../domain/memory/model.ts';
import { memoryContextSources, memoryEligible } from './retrieval.ts';

export const MEMORY_EXTRACTION_PROMPT = readFileSync(
  new URL('./memory-extraction-v1.md', import.meta.url),
  'utf8',
).trim();

if (!MEMORY_EXTRACTION_PROMPT || MEMORY_EXTRACTION_PROMPT.length > 12000) {
  throw new Error('Prompt de extração de memória inválido.');
}

export function extractionFactContext(
  candidates: MemoryFact[],
  selectedIds: string[],
  currentSources: MemorySource[],
  dataClass: MemorySource['dataClass'],
  budget = 3000,
) {
  const turns = new Set(currentSources.map((source) => source.id));
  const eligible = candidates.filter(
    (fact) =>
      fact.status === 'confirmed' &&
      memoryEligible(fact, dataClass) &&
      (fact.expiresAt === null || fact.expiresAt > Date.now()),
  );
  const priority = eligible.filter((fact) =>
    memoryContextSources(fact).some((source) => turns.has(source.turnId)),
  );
  const ordered = [
    ...priority,
    ...eligible.filter((fact) => selectedIds.includes(fact.id)),
  ];
  const known: MemoryFact[] = [];
  const wire: {
    id: string;
    version: number;
    text: string;
    kind: MemoryFact['kind'];
    expiresAt: number | null;
    relation: MemoryFact['relation'];
  }[] = [];

  for (const fact of ordered) {
    if (known.length >= 12) {
      break;
    }

    if (known.some((item) => item.id === fact.id)) {
      continue;
    }

    const item = {
      id: fact.id,
      version: fact.version,
      text: fact.text,
      kind: fact.kind,
      expiresAt: fact.expiresAt,
      relation: fact.relation,
    };

    if (JSON.stringify([...wire, item]).length > budget) {
      continue;
    }

    known.push(fact);
    wire.push(item);
  }

  return { known, wire };
}

export function parseMemoryExtraction(
  content: string,
  sources: MemorySource[],
  currentSources: MemorySource[] = sources,
  existingFacts: MemoryFact[] = [],
): SuggestedFact[] {
  try {
    const result = ExtractionSchema.parse(JSON.parse(content));

    for (const fact of result.facts) {
      if (
        !fact.evidence.some((e) =>
          currentSources.some((s) => s.id === e.turnId),
        )
      ) {
        throw new Error('No current evidence');
      }

      if (
        fact.supersedes &&
        (fact.kind !== 'correction' ||
          !existingFacts.some(
            (f) =>
              f.id === fact.supersedes!.factId &&
              f.version === fact.supersedes!.version &&
              f.status === 'confirmed',
          ))
      ) {
        throw new Error('Invalid correction');
      }

      for (const evidence of fact.evidence) {
        if (
          !sources.some(
            (source) =>
              source.id === evidence.turnId &&
              source.userText.includes(evidence.quote),
          )
        ) {
          throw new Error('Unsupported evidence');
        }
      }
    }

    return result.facts;
  } catch {
    throw new ProviderInvalidError(
      'A extração de memória não corresponde ao contrato ou às fontes.',
    );
  }
}

// Extractors only suggest; the repository applies the configured approval policy.
export function suggestLocally(sources: MemorySource[]): SuggestedFact[] {
  const suggestions: SuggestedFact[] = [];

  for (const source of sources) {
    if (
      /\b(fictíci\p{L}*|ficção|imagine|hipotétic\p{L}*|exemplo|se eu|personagem)\b/iu.test(
        source.userText,
      )
    ) {
      continue;
    }

    // Remove only explicit conversational tags, preserving the literal source
    // as evidence. A question about the declaration itself is not a fact.
    const text = source.userText
      .trim()
      .replace(/,\s*(?:sabia|sabe|né|viu)\s*[.!?]?$/iu, '')
      .trim();
    const declaration = text.match(
      /^(?:eu\s+)?(meu nome é|prefiro|gosto de|uso|estou desenvolvendo)\s+([^.!?\n]{1,120})[.!]?$/iu,
    );

    if (!declaration) {
      continue;
    }

    const verb = declaration[1]!;
    const object = declaration[2]!.trim();
    const identity = /^meu nome é$/iu.test(verb);
    const project = /^estou desenvolvendo$/iu.test(verb);
    const uses = /^uso$/iu.test(verb);
    suggestions.push({
      text,
      category: identity
        ? 'identidade'
        : project
          ? 'projeto'
          : uses
            ? 'contexto'
            : 'preferencia',
      relation: {
        subject: 'usuário',
        predicate: identity
          ? 'chama_se'
          : project
            ? 'desenvolve'
            : uses
              ? 'usa'
              : 'prefere',
        object,
      },
      evidence: [{ turnId: source.id, quote: source.userText.trim() }],
    });
  }

  return suggestions.slice(0, 12);
}

export function summarizeSources(sources: MemorySource[]) {
  // Extractive checkpoint: keeps source IDs and uncertainty, without invented narrative.
  const selected: Record<string, unknown>[] = [];

  for (const source of sources) {
    const entry = {
      turnId: source.id,
      user: source.userText.slice(0, 180),
      userTruncated: source.userText.length > 180,
      assistantConfirmed: source.assistantConfirmed.slice(0, 100),
      assistantTruncated: source.assistantConfirmed.length > 100,
      responseStatus: source.responseStatus,
      partiallyPlayed: source.partiallyPlayed,
    };

    if (JSON.stringify([...selected, entry]).length > 3500) {
      break;
    }

    selected.push(entry);
  }

  return selected.length ? JSON.stringify(selected) : '';
}
