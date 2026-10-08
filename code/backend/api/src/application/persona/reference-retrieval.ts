import type { MemoryEmbeddings } from '../../ports/memory-embeddings.ts';
import type { MemoryReranker } from '../../ports/memory-reranker.ts';
import { validRelevance } from '../../domain/memory/ranking.ts';
import type {
  PersonaReferenceRepository,
  PersonaReferenceRetriever,
  ReferenceSelection,
} from '../../ports/persona-references.ts';
import {
  referenceHash,
  referencePassage,
  type PersonaReference,
} from '../../domain/persona/reference.ts';
import { validEmbedding } from '../../domain/memory/embeddings.ts';
import { referenceContextCharacters } from './corpus-context.ts';

const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + value * b[index]!, 0);
const empty = (state: ReferenceSelection['state']): ReferenceSelection => ({
  examples: [],
  lore: [],
  characters: 0,
  state,
});

export function createPersonaReferenceRetrieval(
  repository: PersonaReferenceRepository,
  embeddings?: MemoryEmbeddings,
  defaults = { maxExamples: 6, maxLore: 2, characters: 6000, waitMs: 1000 },
  reranker?: MemoryReranker,
) {
  let entries: PersonaReference[] = [];
  let vectors = new Map<string, number[]>();
  let closed = false;
  let activeQuery:
    Promise<{ vector: number[]; relevance: Map<string, number> }> | undefined;
  let retryAt = 0;
  const cache = new Map<
    string,
    { vector: number[]; relevance: Map<string, number> }
  >();
  const status = {
    state: (embeddings
      ? 'unindexed'
      : 'disabled') as ReferenceSelection['state'],
    documents: 0,
    styles: 0,
    lore: 0,
    rawStory: 0,
    indexed: 0,
    model: embeddings?.key ?? null,
    reranker: reranker?.key ?? null,
  };

  function select(
    query: { vector: number[]; relevance: Map<string, number> },
    options: typeof defaults,
  ): ReferenceSelection {
    const selection = empty('ready');
    const ranked = entries
      .filter(
        (entry) =>
          entry.reviewed &&
          entry.kind !== 'lore-source' &&
          vectors.has(entry.id),
      )
      .map((entry) => ({
        entry,
        score: query.relevance.size
          ? (query.relevance.get(entry.id) ?? 0)
          : cosine(query.vector, vectors.get(entry.id)!),
      }))
      .filter(
        ({ entry, score }) =>
          score >=
          (query.relevance.size ? 0.15 : entry.kind === 'style' ? 0.58 : 0.6),
      );
    const bestStyle = Math.max(
      0,
      ...ranked
        .filter((candidate) => candidate.entry.kind === 'style')
        .map((candidate) => candidate.score),
    );
    const bestLore = Math.max(
      0,
      ...ranked
        .filter((candidate) => candidate.entry.kind === 'lore')
        .map((candidate) => candidate.score),
    );
    // Keep a relevance window per namespace instead of filling the requested
    // count with weaker matches. Reranker probabilities are only relevance scores.
    const eligible = ranked.filter(
      (candidate) =>
        candidate.score >=
        (candidate.entry.kind === 'style' ? bestStyle : bestLore) -
          (query.relevance.size ? 0.15 : 0.06),
    );
    ranked.splice(0, ranked.length, ...eligible);
    const usedSources = new Set<string>();

    while (ranked.length) {
      // Maximal marginal relevance: prefer pertinent but nonredundant examples.
      ranked.sort((a, b) => {
        const score = (candidate: typeof a) =>
          candidate.score -
          0.12 *
            Math.max(
              0,
              ...selection.examples.map((entry) =>
                cosine(
                  vectors.get(candidate.entry.id)!,
                  vectors.get(entry.id)!,
                ),
              ),
            );

        return score(b) - score(a) || a.entry.id.localeCompare(b.entry.id);
      });
      const { entry } = ranked.shift()!;
      const group =
        entry.kind === 'style' ? selection.examples : selection.lore;

      if (
        group.length >=
        (entry.kind === 'style' ? options.maxExamples : options.maxLore)
      ) {
        continue;
      }

      if (
        entry.kind === 'style' &&
        entry.provenance.some((source) => usedSources.has(source.sourceId))
      ) {
        continue;
      }

      group.push(entry);
      const characters = referenceContextCharacters(selection);

      if (characters > options.characters) {
        group.pop();
        continue;
      }

      selection.characters = characters;

      if (entry.kind === 'style') {
        entry.provenance.forEach((source) => usedSources.add(source.sourceId));
      }
    }

    return selection;
  }

  const service: PersonaReferenceRetriever & {
    start(): Promise<void>;
    index(): Promise<void>;
    warm(): Promise<void>;
    close(): Promise<void>;
    status(): typeof status;
  } = {
    async start() {
      entries = await repository.documents();
      vectors = embeddings
        ? await repository.vectors(embeddings.key)
        : new Map();
      Object.assign(status, {
        documents: entries.length,
        styles: entries.filter((entry) => entry.kind === 'style').length,
        lore: entries.filter((entry) => entry.kind === 'lore').length,
        rawStory: entries.filter((entry) => entry.kind === 'lore-source')
          .length,
        indexed: vectors.size,
        state: embeddings ? (vectors.size ? 'ready' : 'unindexed') : 'disabled',
      });
    },
    async index() {
      if (!embeddings || closed) {
        return;
      }

      for (const entry of entries.filter(
        (entry) =>
          entry.reviewed &&
          entry.kind !== 'lore-source' &&
          !vectors.has(entry.id),
      )) {
        if (closed) {
          break;
        }

        const generated = await embeddings.embed(
          [referencePassage(entry)],
          'passage',
        );

        if (generated.length !== 1 || !validEmbedding(generated[0])) {
          throw new Error('Embedding de referência inválido.');
        }

        await repository.saveVector(
          entry.id,
          referenceHash(JSON.stringify(entry)),
          embeddings.key,
          generated[0],
        );
        vectors.set(entry.id, generated[0]);
      }

      status.indexed = vectors.size;
      status.state = vectors.size ? 'ready' : 'unindexed';
    },
    async warm() {
      if (!embeddings || !vectors.size || closed) {
        return;
      }

      try {
        await embeddings.embed(
          ['Referência contextual de atuação da personagem.'],
          'query',
        );
        const entry = entries.find(
          (entry) => entry.reviewed && entry.kind === 'style',
        );

        if (reranker && entry) {
          await reranker.rank(entry.situation, [referencePassage(entry)]);
        }
      } catch {
        status.state = 'degraded';
      }
    },
    async retrieve(query, signal, override = {}) {
      signal.throwIfAborted();

      if (!embeddings || closed) {
        return empty('disabled');
      }

      if (!vectors.size) {
        return empty('unindexed');
      }

      if (!query.trim() || Date.now() < retryAt) {
        return empty('degraded');
      }

      const options = { ...defaults, ...override };

      if (
        !Number.isInteger(options.maxExamples) ||
        options.maxExamples < 0 ||
        options.maxExamples > 12 ||
        !Number.isInteger(options.maxLore) ||
        options.maxLore < 0 ||
        options.maxLore > 4 ||
        !Number.isInteger(options.characters) ||
        options.characters < 0 ||
        options.characters > 16000 ||
        !Number.isFinite(options.waitMs) ||
        options.waitMs < 0 ||
        options.waitMs > 30000
      ) {
        throw new Error('Orçamento de referências inválido.');
      }

      if (!options.maxExamples && !options.maxLore) {
        return empty('ready');
      }

      const text = query.trim().slice(0, 1800);
      const focus = (override.focus ?? text).trim().slice(0, 1200);

      if (!focus) {
        return empty('ready');
      }

      const key = referenceHash(JSON.stringify({ text, focus }));

      if (cache.has(key)) {
        return select(cache.get(key)!, options);
      }

      // Only one uncached lookup can occupy the shared local worker at a time.
      if (activeQuery) {
        return empty('timeout');
      }

      const pending = embeddings
        .embed([text], 'query')
        .then(async (generated) => {
          if (generated.length !== 1 || !validEmbedding(generated[0])) {
            throw new Error('Consulta semântica inválida.');
          }

          const relevance = new Map<string, number>();

          if (reranker && !closed) {
            const pool = entries
              .filter(
                (entry) =>
                  entry.reviewed &&
                  entry.kind !== 'lore-source' &&
                  vectors.has(entry.id),
              )
              .map((entry) => ({
                entry,
                score: cosine(generated[0]!, vectors.get(entry.id)!),
              }))
              .filter(({ score }) => score >= 0.4)
              .sort((a, b) => b.score - a.score)
              .slice(0, 12);

            if (pool.length) {
              const ranked = await reranker.rank(
                focus,
                pool.map(({ entry }) => referencePassage(entry)),
              );

              if (
                ranked.length !== pool.length ||
                !ranked.every(validRelevance)
              ) {
                throw new Error('Relevância de referência inválida.');
              }

              pool.forEach(({ entry }, index) =>
                relevance.set(entry.id, ranked[index]!),
              );
            }
          }

          const query = { vector: generated[0], relevance };

          if (!closed) {
            cache.set(key, query);

            while (cache.size > 32) {
              cache.delete(cache.keys().next().value!);
            }
          }

          return query;
        });
      activeQuery = pending;
      void pending
        .finally(() => {
          activeQuery = undefined;
        })
        .catch(() => undefined);
      let timer: NodeJS.Timeout | undefined;
      let aborted: (() => void) | undefined;

      try {
        const vector = await Promise.race([
          pending,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), options.waitMs);
          }),
          new Promise<never>((_, reject) => {
            aborted = () => reject(signal.reason);
            signal.addEventListener('abort', aborted, { once: true });

            if (signal.aborted) {
              aborted();
            }
          }),
        ]);
        signal.throwIfAborted();

        return vector ? select(vector, options) : empty('timeout');
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        status.state = 'degraded';
        retryAt = Date.now() + 60000;

        return empty('degraded');
      } finally {
        if (timer) {
          clearTimeout(timer);
        }

        if (aborted) {
          signal.removeEventListener('abort', aborted);
        }
      }
    },
    status: () => ({ ...status }),
    async close() {
      closed = true;
      cache.clear();
      await activeQuery?.catch(() => undefined);
    },
  };

  return service;
}
