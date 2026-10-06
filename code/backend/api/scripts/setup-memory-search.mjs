import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEmbeddingModel } from '../src/adapters/embeddings/model.ts';
import { MEMORY_EMBEDDING_KEY } from '../src/domain/memory/embeddings.ts';
import { loadRerankerModel } from '../src/adapters/embeddings/reranker-model.ts';
import { MEMORY_RERANK_KEY } from '../src/domain/memory/ranking.ts';

const cacheDirectory =
  process.env.MEMORY_MODEL_CACHE_DIRECTORY ??
  fileURLToPath(new URL('../data/models/', import.meta.url));
await mkdir(cacheDirectory, { recursive: true });
console.log('Baixando o modelo multilíngue local. Nenhuma conversa é enviada.');
const model = await loadEmbeddingModel(cacheDirectory, true);
await model.dispose();
if (process.env.MEMORY_RERANK_ENABLED !== 'false') {
  const reranker = await loadRerankerModel(cacheDirectory, true);
  await reranker.dispose();
  console.log(JSON.stringify({ ready: true, reranker: MEMORY_RERANK_KEY }));
}
console.log(
  JSON.stringify({ ready: true, model: MEMORY_EMBEDDING_KEY, cacheDirectory }),
);
