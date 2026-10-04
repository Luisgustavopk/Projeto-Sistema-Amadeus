import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import { segmentSpeech } from '../../domain/voice/segmentation.ts';

export async function* streamSpeech(
  source: (signal: AbortSignal) => AsyncIterable<string>,
  signal: AbortSignal,
): AsyncIterable<string> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener('abort', cancel, { once: true });

  if (signal.aborted) {
    cancel();
  }

  const queue: string[] = [];

  let wake = () => {};

  let done = false;
  let failure: unknown;
  let count = 0;
  let text = '';
  let length = 0;

  const enqueue = (value: string) => {
    if (++count > 24) {
      throw new ProviderInvalidError('Resposta excede 24 segmentos.');
    }

    queue.push(value);
    wake();
  };

  const producer = (async () => {
    try {
      for await (const chunk of source(abort.signal)) {
        abort.signal.throwIfAborted();
        length += chunk.length;

        if (length > 5280) {
          throw new ProviderInvalidError('Resposta falada excede o limite.');
        }

        text += chunk;

        while (text.trim()) {
          const sentenceEnd = text.search(/[.!?]\s/);
          let end = sentenceEnd >= 0 ? sentenceEnd + 1 : 0;

          if (end > 220 || (!end && text.length >= 220)) {
            const prefix = text.slice(0, 220);
            const clauses = [...prefix.matchAll(/[,;]\s/g)];
            const clause = clauses.at(-1)?.index;
            const word = text.lastIndexOf(' ', 220);
            end =
              clause !== undefined && clause >= 24
                ? clause + 1
                : word > 0
                  ? word
                  : 220;
          }

          if (!end) {
            break;
          }

          const value = text.slice(0, end).replace(/\s+/g, ' ').trim();
          text = text.slice(end).trimStart();

          if (value) {
            enqueue(value);
          }
        }
      }

      for (const value of segmentSpeech(text)) {
        enqueue(value);
      }
    } catch (error) {
      failure = error;
    } finally {
      done = true;
      wake();
    }
  })();

  try {
    while (true) {
      signal.throwIfAborted();
      const value = queue.shift();

      if (value) {
        yield value;
        continue;
      }

      if (done) {
        if (failure) {
          throw failure;
        }

        break;
      }

      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    abort.abort();
    signal.removeEventListener('abort', cancel);
    await producer;
  }
}
