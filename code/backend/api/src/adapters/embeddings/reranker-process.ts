import { loadRerankerModel } from './reranker-model.ts';

const model = loadRerankerModel(process.argv[2]!);
void model.catch(() => undefined);
let queue = Promise.resolve();
process.on(
  'message',
  (request: { id: number; query: string; documents: string[] }) => {
    queue = queue.then(async () => {
      try {
        process.send?.({
          id: request.id,
          scores: await (await model).rank(request.query, request.documents),
        });
      } catch {
        process.send?.({ id: request.id, error: true });
      }
    });
  },
);
process.on('disconnect', () => {
  process.exit(0);
});
