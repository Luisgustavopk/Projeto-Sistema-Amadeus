import {
  ExpressionSchema,
  NEUTRAL_EXPRESSION,
  type Expression,
} from '../../domain/persona/expression.ts';

/** Opt-in prototype: late metadata can change the next visual state, never past audio. */
export function observedSpeech(options: {
  speech: AsyncIterable<string>;
  factCount: number;
  signal: AbortSignal;
  classify: (firstSpeech: string, signal: AbortSignal) => Promise<unknown>;
  expression: (
    value: Expression,
    event: { initial: boolean; valid: boolean; deliveryApplied: false },
  ) => void;
}) {
  if (options.factCount !== 0) {
    throw new Error('Fala simples não libera fatos persistentes sem revisão.');
  }

  let observation: Promise<void> | undefined;
  let failure: string | null = null;
  const cancelled = new AbortController();
  const signal = AbortSignal.any([options.signal, cancelled.signal]);

  return {
    async *stream(): AsyncIterable<string> {
      signal.throwIfAborted();
      options.expression(
        { ...NEUTRAL_EXPRESSION },
        { initial: true, valid: false, deliveryApplied: false },
      );

      let completed = false;

      try {
        for await (const segment of options.speech) {
          signal.throwIfAborted();

          if (!observation && segment.trim()) {
            observation = Promise.resolve().then(async () => {
              try {
                const proposed = await options.classify(segment, signal);
                signal.throwIfAborted();
                const result = ExpressionSchema.safeParse(proposed);

                if (result.success) {
                  options.expression(result.data, {
                    initial: false,
                    valid: true,
                    deliveryApplied: false,
                  });
                } else {
                  failure = 'INVALID_EXPRESSION';
                }
              } catch {
                failure = signal.aborted ? 'ABORTED' : 'CLASSIFIER_FAILED';
              }
            });
          }

          // The observer is deliberately not awaited before yielding speech.
          yield segment;
        }

        completed = true;
      } finally {
        if (!completed) {
          cancelled.abort();
        }
      }
    },
    async observationResult() {
      await observation;

      return { attempted: Boolean(observation), error: failure };
    },
  };
}
