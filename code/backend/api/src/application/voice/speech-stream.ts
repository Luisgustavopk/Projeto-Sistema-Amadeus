import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import { segmentSpeech } from '../../domain/voice/segmentation.ts';

export async function* streamSpeech(
  source: (signal: AbortSignal) => AsyncIterable<string>,
  signal: AbortSignal,
  options: { firstFlushMs?: number } = {},
): AsyncIterable<string> {
  const firstFlushMs = options.firstFlushMs ?? 700;

  if (
    !Number.isFinite(firstFlushMs) ||
    firstFlushMs < 0 ||
    firstFlushMs > 5000
  ) {
    throw new RangeError('Prazo inicial de segmentação inválido.');
  }

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
  let firstDeadline = 0;
  let firstTimer: ReturnType<typeof setTimeout> | undefined;

  const enqueue = (value: string) => {
    if (++count > 24) {
      throw new ProviderInvalidError('Resposta excede 24 segmentos.');
    }

    queue.push(value);

    if (firstTimer) {
      clearTimeout(firstTimer);
    }

    wake();
  };

  const flushFirst = () => {
    if (count || done || abort.signal.aborted) {
      return;
    }

    const ends = [...text.slice(0, 221).matchAll(/(?<!\d)[.!?](?:\s|$)/gu)];
    const end = ends.at(-1)?.index;

    if (end === undefined || end < 24) {
      return;
    }

    const value = text
      .slice(0, end + 1)
      .replace(/\s+/g, ' ')
      .trim();
    text = text.slice(end + 1).trimStart();
    enqueue(value);
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

        if (text && !firstDeadline) {
          firstDeadline = Date.now() + firstFlushMs;
          firstTimer = setTimeout(flushFirst, firstFlushMs);
        }

        if (firstDeadline && Date.now() >= firstDeadline) {
          flushFirst();
        }

        // Keep short replies in one synthesis request: punctuation is a pause,
        // not a reason to restart the voice. Long replies still stream in order.
        while (text.length > 220) {
          const sentences = [...text.slice(0, 221).matchAll(/(?<!\d)[.!?]\s/g)];
          const sentenceEnd = sentences.at(-1)?.index;
          let end =
            sentenceEnd !== undefined && sentenceEnd >= 40
              ? sentenceEnd + 1
              : 0;

          if (!end) {
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
      if (firstTimer) {
        clearTimeout(firstTimer);
      }

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
    if (firstTimer) {
      clearTimeout(firstTimer);
    }

    abort.abort();
    signal.removeEventListener('abort', cancel);
    await producer;
  }
}
