export const MEMORY_RERANK_MODEL = 'jinaai/jina-reranker-v2-base-multilingual';
export const MEMORY_RERANK_REVISION =
  '9cfeff2df7d40d1b78e75e5e9cebec92a99813c9';
export const MEMORY_RERANK_KEY = `${MEMORY_RERANK_MODEL}@${MEMORY_RERANK_REVISION}:q8:256:v1`;
export const MEMORY_CONTEXT_CHARACTERS = 3000;

export function validRelevance(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 1
  );
}
