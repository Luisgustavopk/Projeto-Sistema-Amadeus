import type { MemoryFact } from './model.ts';

export const MEMORY_EMBEDDING_MODEL = 'Xenova/bge-m3';
export const MEMORY_EMBEDDING_REVISION =
  '4de13258303883538bd53b696b452bf8099f0858';
export const MEMORY_EMBEDDING_DIMENSIONS = 1024;
export const MEMORY_EMBEDDING_KEY = `${MEMORY_EMBEDDING_MODEL}@${MEMORY_EMBEDDING_REVISION}:q8:cls:normalized:512:v1`;

export type EmbeddingDocument = Pick<
  MemoryFact,
  'id' | 'version' | 'text' | 'category' | 'relation'
> & {
  vector: number[] | null;
  contentHash: string | null;
};

// Natural language is the main signal. Structural labels are deliberately not
// translated into a fixed vocabulary for the embedding model.
export function embeddingText(fact: Pick<MemoryFact, 'text'>) {
  return fact.text;
}

export function validEmbedding(vector: unknown): vector is number[] {
  if (
    !Array.isArray(vector) ||
    vector.length !== MEMORY_EMBEDDING_DIMENSIONS ||
    !vector.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    return false;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return Math.abs(norm - 1) < 0.01;
}

export type MemorySearchStatus = {
  enabled: boolean;
  model: string | null;
  state: 'disabled' | 'idle' | 'ready' | 'degraded';
  lastError: 'LOCAL_MODEL_UNAVAILABLE' | null;
  indexedFacts: number;
};
