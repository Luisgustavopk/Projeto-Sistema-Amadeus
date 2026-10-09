import { observedSpeech } from './observed-speech.ts';
import {
  readPersonaResponse,
  validateSpokenSegment,
} from './response-stream.ts';
import { streamSpeech } from '../voice/speech-stream.ts';
import type { Expression } from '../../domain/persona/expression.ts';

/** Candidate pipeline. No classifier await on the speech path; no fact-review bypass. */
export function createParallelExpressionSpeech(options: {
  source: (signal: AbortSignal) => AsyncIterable<string>;
  signal: AbortSignal;
  factCount: number;
  classify: (firstSpeech: string, signal: AbortSignal) => Promise<unknown>;
  onExpression: (
    expression: Expression,
    event: { initial: boolean; valid: boolean; deliveryApplied: false },
  ) => void;
}) {
  const speech = (async function* () {
    for await (const segment of streamSpeech(
      (signal) => readPersonaResponse(options.source(signal), () => {}),
      options.signal,
    )) {
      const usable = validateSpokenSegment(segment);

      if (usable) {
        yield usable;
      }
    }
  })();

  return observedSpeech({
    speech,
    signal: options.signal,
    factCount: options.factCount,
    classify: options.classify,
    expression: options.onExpression,
  });
}
