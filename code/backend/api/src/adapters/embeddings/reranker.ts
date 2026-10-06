import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { MemoryReranker } from '../../ports/memory-reranker.ts';
import {
  MEMORY_RERANK_KEY,
  validRelevance,
} from '../../domain/memory/ranking.ts';

export function createLocalMemoryReranker(
  cacheDirectory: string,
): MemoryReranker {
  // ONNX native bindings can crash when two independent worker isolates load
  // models on Windows. Keep reranking in its own local process, off the API
  // event loop and isolated from the embeddings worker's native runtime.
  let worker: ChildProcess | undefined;
  let id = 0;
  let closed = false;
  const pending = new Map<
    number,
    {
      count: number;
      resolve: (scores: number[]) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  const unavailable = () => new Error('Reranqueador local indisponível.');

  function fail() {
    const current = worker;
    worker = undefined;

    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(unavailable());
    }

    pending.clear();
    current?.kill();
  }

  function getWorker() {
    if (!worker) {
      const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
      const current = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL(`./reranker-process.${extension}`, import.meta.url),
          ),
          cacheDirectory,
        ],
        { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true },
      );
      worker = current;
      current.on(
        'message',
        (message: { id: number; scores?: unknown; error?: boolean }) => {
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
            Array.isArray(message.scores) &&
            message.scores.length === request.count &&
            message.scores.every(validRelevance)
          ) {
            request.resolve(message.scores);
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
    key: MEMORY_RERANK_KEY,
    async rank(query, documents) {
      if (closed) {
        throw unavailable();
      }

      if (!documents.length) {
        return [];
      }

      if (documents.length > 24) {
        throw new Error('Lote de reranqueamento excede 24 documentos.');
      }

      const current = getWorker();
      const requestId = ++id;

      return new Promise<number[]>((resolve, reject) => {
        const timer = setTimeout(fail, 10000);
        timer.unref();
        pending.set(requestId, {
          resolve,
          reject,
          timer,
          count: documents.length,
        });
        current.ref();
        current.send(
          { id: requestId, query: query.slice(-2000), documents },
          (error) => {
            if (error && worker === current) {
              fail();
            }
          },
        );
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

      if (current && current.exitCode === null && current.signalCode === null) {
        current.ref();
        await new Promise<void>((resolve) => {
          current.once('exit', () => resolve());
          current.kill();
        });
      }
    },
  };
}
