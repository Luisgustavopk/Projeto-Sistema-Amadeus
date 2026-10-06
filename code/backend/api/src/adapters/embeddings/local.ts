import { Worker } from 'node:worker_threads';
import type { MemoryEmbeddings } from '../../ports/memory-embeddings.ts';
import {
  MEMORY_EMBEDDING_KEY,
  validEmbedding,
} from '../../domain/memory/embeddings.ts';

export function createLocalMemoryEmbeddings(
  cacheDirectory: string,
): MemoryEmbeddings {
  let worker: Worker | undefined;
  let nextId = 0;
  let closed = false;
  const pending = new Map<
    number,
    {
      resolve: (vectors: number[][]) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
      count: number;
    }
  >();
  const unavailable = () =>
    new Error(
      'Modelo local de memória indisponível; execute npm run setup:memory-search.',
    );

  function fail() {
    const failed = worker;
    worker = undefined;

    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(unavailable());
    }

    pending.clear();

    if (failed) {
      void failed.terminate();
    }
  }

  function getWorker() {
    if (!worker) {
      const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
      const current = new Worker(
        new URL(`./worker.${extension}`, import.meta.url),
        { workerData: { cacheDirectory }, execArgv: [] },
      );
      worker = current;
      current.on(
        'message',
        (message: { id: number; vectors?: unknown; error?: boolean }) => {
          const request = pending.get(message.id);

          if (!request) {
            return;
          }

          pending.delete(message.id);
          clearTimeout(request.timer);

          if (!pending.size) {
            current.unref();
          }

          if (
            !message.error &&
            Array.isArray(message.vectors) &&
            message.vectors.length === request.count &&
            message.vectors.every(validEmbedding)
          ) {
            request.resolve(message.vectors as number[][]);
          } else {
            request.reject(unavailable());
          }
        },
      );
      current.on('error', () => {
        if (worker === current) {
          fail();
        }
      });
      current.on('exit', () => {
        if (worker === current) {
          fail();
        }
      });
      current.unref();
    }

    return worker;
  }

  return {
    key: MEMORY_EMBEDDING_KEY,
    async embed(texts, kind) {
      if (closed) {
        throw unavailable();
      }

      if (!texts.length) {
        return [];
      }

      if (texts.length > 16) {
        throw new Error('Lote de embeddings excede 16 textos.');
      }

      const current = getWorker();
      const id = ++nextId;

      return new Promise<number[][]>((resolve, reject) => {
        const timer = setTimeout(fail, 30000);
        timer.unref();
        pending.set(id, { resolve, reject, timer, count: texts.length });
        current.ref();
        current.postMessage({ id, texts, kind });
      });
    },
    async close() {
      closed = true;
      const current = worker;
      worker = undefined;

      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(unavailable());
      }

      pending.clear();

      if (current) {
        await current.terminate();
      }
    },
  };
}
