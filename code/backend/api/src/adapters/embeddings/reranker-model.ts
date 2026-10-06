import { AutoTokenizer, XLMRobertaModel, env } from '@huggingface/transformers';
import {
  MEMORY_RERANK_MODEL,
  MEMORY_RERANK_REVISION,
} from '../../domain/memory/ranking.ts';

export async function loadRerankerModel(
  cacheDirectory: string,
  download = false,
) {
  env.cacheDir = cacheDirectory;
  env.allowRemoteModels = download;
  env.allowLocalModels = true;
  const options = {
    revision: MEMORY_RERANK_REVISION,
    local_files_only: !download,
    dtype: 'q8' as const,
    device: 'cpu' as const,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  };
  const tokenizer = await AutoTokenizer.from_pretrained(
    MEMORY_RERANK_MODEL,
    options,
  );
  // The published ONNX graph returns logits; no repository Python/custom code
  // is loaded. This explicit class supports the pinned Transformers.js v3 API.
  const model = await XLMRobertaModel.from_pretrained(
    MEMORY_RERANK_MODEL,
    options,
  );

  return {
    async rank(query: string, documents: string[]) {
      const scores: number[] = [];

      for (let offset = 0; offset < documents.length; offset += 8) {
        const batch = documents.slice(offset, offset + 8);
        const inputs = tokenizer(
          batch.map(() => query),
          {
            text_pair: batch,
            padding: true,
            truncation: true,
            max_length: 256,
          },
        );
        const output = await model(inputs);
        scores.push(
          ...(output.logits.sigmoid().tolist() as number[][]).map(
            (row) => row[0]!,
          ),
        );
      }

      return scores;
    },
    dispose: () => model.dispose(),
  };
}
