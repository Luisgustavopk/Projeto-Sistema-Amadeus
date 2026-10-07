import type { ProviderOutput } from '../../ports/provider.ts';
import { ProviderTemporarilyUnavailableError } from '../../domain/errors/providers.ts';

/** A voice deadline for first content, not for completing a streamed answer. */
export async function* withFirstChunkDeadline(
  source: (signal?: AbortSignal) => AsyncIterable<ProviderOutput>,
  signal?: AbortSignal,
  milliseconds?: number,
): AsyncIterable<ProviderOutput> {
  if (milliseconds === undefined) {
    yield* source(signal);

    return;
  }

  if (
    !Number.isInteger(milliseconds) ||
    milliseconds < 100 ||
    milliseconds > 30000
  ) {
    throw new RangeError('Prazo inicial inválido.');
  }

  const abort = new AbortController();
  const bounded = signal
    ? AbortSignal.any([signal, abort.signal])
    : abort.signal;
  let expired = false;
  let awaitingContent = true;

  let rejectDeadline: (error: Error) => void = () => {};

  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(() => {
    expired = true;
    const error = new ProviderTemporarilyUnavailableError(
      'A LLM não iniciou a resposta no prazo de voz.',
    );
    abort.abort(error);
    rejectDeadline(error);
  }, milliseconds);
  const cancel = () => rejectDeadline(bounded.reason);
  bounded.addEventListener('abort', cancel, { once: true });
  const iterator = source(bounded)[Symbol.asyncIterator]();

  try {
    while (true) {
      const next = awaitingContent
        ? await Promise.race([iterator.next(), deadline])
        : await iterator.next();
      bounded.throwIfAborted();

      if (next.done) {
        return;
      }

      if (next.value.content.trim()) {
        awaitingContent = false;
        clearTimeout(timer);
      }

      yield next.value;
    }
  } finally {
    clearTimeout(timer);
    bounded.removeEventListener('abort', cancel);
    const interrupted = bounded.aborted;
    abort.abort();
    const close = iterator.return?.();

    // A faulty adapter that ignores cancellation must not hold the router.
    if (expired || interrupted) {
      void close?.catch(() => undefined);
    } else {
      await close;
    }
  }
}
