import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import {
  NEUTRAL_EXPRESSION,
  type Expression,
} from '../../domain/persona/expression.ts';
import { streamSpeech } from '../voice/speech-stream.ts';
import {
  readPersonaResponse,
  validateSpokenSegment,
} from './response-stream.ts';

/** Recover once, only before any validated speech leaves this boundary. */
export async function* streamPersonaSpeech(
  source: (signal: AbortSignal, speechOnly: boolean) => AsyncIterable<string>,
  signal: AbortSignal,
  onExpression: (value: Expression, valid: boolean) => void,
  onRecovery: () => void,
  validateStyle?: (text: string, delivered: boolean) => void,
): AsyncIterable<string> {
  let delivered = false;

  for (const speechOnly of [false, true]) {
    let usable = false;

    try {
      for await (const segment of streamSpeech(
        (streamSignal) =>
          readPersonaResponse(source(streamSignal, speechOnly), onExpression),
        signal,
      )) {
        const text = validateSpokenSegment(segment);

        if (text) {
          validateStyle?.(text, delivered);
          usable = true;
          delivered = true;
          yield text;
        }
      }

      if (!usable) {
        throw new ProviderInvalidError('O modelo não retornou texto falável.');
      }

      return;
    } catch (error) {
      if (
        signal.aborted ||
        delivered ||
        speechOnly ||
        !(error instanceof ProviderInvalidError)
      ) {
        throw error;
      }

      onExpression({ ...NEUTRAL_EXPRESSION }, false);
      onRecovery();
    }
  }
}
