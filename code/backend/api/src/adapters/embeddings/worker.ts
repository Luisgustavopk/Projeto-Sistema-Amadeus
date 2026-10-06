import { parentPort, workerData } from 'node:worker_threads';
import { loadEmbeddingModel } from './model.ts';

const port = parentPort!;
const extractor = loadEmbeddingModel(
  (workerData as { cacheDirectory: string }).cacheDirectory,
);
// A missing cache is reported through requests, not an unhandled rejection.
void extractor.catch(() => undefined);
let queue = Promise.resolve();

port.on(
  'message',
  (request: { id: number; texts: string[]; kind: 'query' | 'passage' }) => {
    queue = queue.then(async () => {
      try {
        const model = await extractor;
        const output = await model(request.texts, {
          pooling: 'cls',
          normalize: true,
        });
        port.postMessage({ id: request.id, vectors: output.tolist() });
      } catch {
        port.postMessage({ id: request.id, error: true });
      }
    });
  },
);
