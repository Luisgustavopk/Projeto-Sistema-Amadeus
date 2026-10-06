import { createHash } from 'node:crypto';
import type { MemoryEmbeddings } from '../../ports/memory-embeddings.ts';
import type { MemoryRepository } from '../../ports/memory-repository.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import {
  embeddingText,
  validEmbedding,
  type MemorySearchStatus,
} from '../../domain/memory/embeddings.ts';

export const MIN_MEMORY_SIMILARITY = 0.4;
// Retrieve a wider candidate set. A generic passage must not suppress a more
// specific answer merely because it shares more words with the question.
const RELATIVE_WINDOW = 0.18;
const contentHash = (text: string) =>
  createHash('sha256').update(text).digest('hex');

export function createSemanticMemorySearch(
  repository: MemoryRepository,
  embeddings?: MemoryEmbeddings,
) {
  let retryAt = 0;
  let queue = Promise.resolve();
  let closed = false;
  const status: MemorySearchStatus = {
    enabled: Boolean(embeddings),
    model: embeddings?.key ?? null,
    state: embeddings ? 'idle' : 'disabled',
    lastError: null,
    indexedFacts: 0,
  };

  // Serialize indexing/search so simultaneous callers don't infer the same
  // missing passages twice. Vectors survive API restarts in SQLite.
  function serial<T>(operation: () => Promise<T>) {
    const pending = queue.then(operation);
    queue = pending.then(
      () => undefined,
      () => undefined,
    );

    return pending;
  }

  async function collect(dataClass: DataClass, canContinue: () => boolean) {
    const vectors = new Map<string, { vector: number[]; version: number }>();
    let afterId = '';
    let remaining = 16;

    while (canContinue() && !closed) {
      const page = await repository.embeddingPage(
        embeddings!.key,
        dataClass,
        afterId,
      );

      if (!page.length) {
        break;
      }

      afterId = page.at(-1)!.id;
      const missing = page.filter(
        (fact) =>
          !fact.vector || fact.contentHash !== contentHash(embeddingText(fact)),
      );

      for (
        let offset = 0;
        offset < missing.length && remaining > 0 && canContinue() && !closed;
        offset += 8
      ) {
        const batch = missing.slice(offset, offset + Math.min(8, remaining));
        const generated = await embeddings!.embed(
          batch.map(embeddingText),
          'passage',
        );

        if (
          generated.length !== batch.length ||
          !generated.every(validEmbedding)
        ) {
          throw new Error('Embedding inválido.');
        }

        for (const [index, fact] of batch.entries()) {
          fact.vector = generated[index]!;
          fact.contentHash = contentHash(embeddingText(fact));
          await repository.saveEmbedding(
            fact,
            embeddings!.key,
            fact.contentHash,
            fact.vector,
          );
        }

        remaining -= batch.length;
      }

      for (const fact of page) {
        if (
          fact.vector &&
          fact.contentHash === contentHash(embeddingText(fact))
        ) {
          vectors.set(fact.id, { vector: fact.vector, version: fact.version });
        }
      }
    }

    status.indexedFacts = vectors.size;

    return vectors;
  }

  async function safely<T>(
    fallback: T,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!embeddings || closed || Date.now() < retryAt) {
      return fallback;
    }

    try {
      const result = await operation();
      status.state = 'ready';
      status.lastError = null;

      return result;
    } catch {
      status.state = 'degraded';
      status.lastError = 'LOCAL_MODEL_UNAVAILABLE';
      retryAt = Date.now() + 60000;

      return fallback;
    }
  }

  return {
    status: () => ({ ...status }),
    index(dataClass: DataClass, canContinue: () => boolean = () => true) {
      return serial(() =>
        safely(undefined, async () => {
          await collect(dataClass, canContinue);
        }),
      );
    },
    search(queries: string[], dataClass: DataClass) {
      return serial(() =>
        safely(
          new Map<string, { score: number; version: number }>(),
          async () => {
            const passages = await collect(dataClass, () => true);

            if (!passages.size || !queries.some((text) => text.trim())) {
              return new Map<string, { score: number; version: number }>();
            }

            // Preserve each utterance separately: a long batch must not truncate
            // the final correction out of a single model input.
            const queryVectors = await embeddings!.embed(
              queries.filter((text) => text.trim()).slice(-16),
              'query',
            );

            if (!queryVectors.every(validEmbedding)) {
              throw new Error('Embedding inválido.');
            }

            const ranked = [...passages]
              .map(([id, { vector, version }]) => ({
                id,
                version,
                score: Math.max(
                  ...queryVectors.map((query) =>
                    query.reduce(
                      (sum, value, index) => sum + value * vector[index]!,
                      0,
                    ),
                  ),
                ),
              }))
              .sort((a, b) => b.score - a.score);
            const cutoff = Math.max(
              MIN_MEMORY_SIMILARITY,
              (ranked[0]?.score ?? 1) - RELATIVE_WINDOW,
            );

            return new Map(
              ranked
                .filter((entry) => entry.score >= cutoff)
                .slice(0, 12)
                .map((entry) => [
                  entry.id,
                  { score: entry.score, version: entry.version },
                ]),
            );
          },
        ),
      );
    },
    async close() {
      closed = true;
      await embeddings?.close();
      await queue;
    },
  };
}
