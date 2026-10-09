import {
  ExpressionSchema,
  type Expression,
} from '../../domain/persona/expression.ts';
import type {
  ExpressionClassifier,
  ExpressionObservation,
} from './expression-classifier.ts';

/** Bounded side work: classification never blocks speech or changes its text. */
export function createSegmentExpressionObserver(options: {
  classifier: ExpressionClassifier;
  signal: AbortSignal;
  timeoutMs: number;
  context: Omit<ExpressionObservation, 'speech'>;
  onResult: (
    target: { segmentId: string; position: number },
    expression: Expression,
  ) => void;
  onFailure: (reason: string) => void;
  onDuration?: (milliseconds: number) => void;
}) {
  const closed = new AbortController();
  const signal = AbortSignal.any([options.signal, closed.signal]);
  let pending = 0;

  return {
    dispose: () => closed.abort(),
    observe(speech: string, target: { segmentId: string; position: number }) {
      if (signal.aborted) {
        return;
      }

      if (pending >= 2) {
        options.onFailure('EXPRESSION_OBSERVER_BUSY');

        return;
      }

      pending++;
      const started = performance.now();
      const timeout = new AbortController();
      const bounded = AbortSignal.any([signal, timeout.signal]);
      const timer = setTimeout(() => timeout.abort(), options.timeoutMs);
      let rejectAbort: () => void;
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new Error('EXPRESSION_OBSERVER_ABORTED'));
        bounded.addEventListener('abort', rejectAbort, { once: true });
      });
      void Promise.race([
        Promise.resolve().then(() =>
          options.classifier.classify({ ...options.context, speech }, bounded),
        ),
        aborted,
      ])
        .then((value) => {
          bounded.throwIfAborted();
          options.onResult(target, ExpressionSchema.parse(value));
        })
        .catch(() => {
          if (!signal.aborted) {
            options.onFailure(
              timeout.signal.aborted
                ? 'EXPRESSION_OBSERVER_TIMEOUT'
                : 'EXPRESSION_OBSERVER_INVALID',
            );
          }
        })
        .finally(() => {
          clearTimeout(timer);
          bounded.removeEventListener('abort', rejectAbort!);
          options.onDuration?.(performance.now() - started);
          pending--;
        });
    },
  };
}
