import { env, pipeline } from '@huggingface/transformers';
import {
  MEMORY_EMBEDDING_MODEL,
  MEMORY_EMBEDDING_REVISION,
} from '../../domain/memory/embeddings.ts';

export async function loadEmbeddingModel(
  cacheDirectory: string,
  download = false,
) {
  // Production never contacts the Hub, including when the cache is incomplete.
  // Only the explicit provisioning script can download this fixed model.
  env.cacheDir = cacheDirectory;
  env.allowRemoteModels = download;
  env.allowLocalModels = true;
  const extractor = await pipeline(
    'feature-extraction',
    MEMORY_EMBEDDING_MODEL,
    {
      revision: MEMORY_EMBEDDING_REVISION,
      local_files_only: !download,
      dtype: 'q8',
      device: 'cpu',
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    },
  );
  // Bound CPU/memory use for conversation batches, despite the model's larger
  // maximum. Each utterance is embedded separately by the application.
  extractor.tokenizer.model_max_length = 512;

  return extractor;
}
