import {
  ProviderInvalidError,
  QuotaExceededError,
  ProviderTemporarilyUnavailableError,
} from '../../domain/errors/providers.ts';
import {
  NEUTRAL_EXPRESSION,
  type Expression,
} from '../../domain/persona/expression.ts';
import { streamSpeech } from '../voice/speech-stream.ts';
import {
  readPersonaResponse,
  validateSpokenSegment,
} from './response-stream.ts';
import type { MemoryResponseUse } from '../../domain/memory/response-use.ts';

/** Repair format before speech; optionally resume once after a provider failure. */
export async function* streamPersonaSpeech(
  source: (
    signal: AbortSignal,
    speechOnly: boolean,
    continuation?: string,
  ) => AsyncIterable<string>,
  signal: AbortSignal,
  onExpression: (value: Expression, valid: boolean) => void,
  onRecovery: () => void,
  validateStyle?: (text: string, delivered: boolean) => void,
  onProviderRecovery?: () => Promise<void>,
  onMemoryUse?: (use: MemoryResponseUse | null) => void,
): AsyncIterable<string> {
  let delivered = false;
  const spoken: string[] = [];
  let speechOnly = false;
  let providerRecovered = false;
  let formatRecovered = false;

  while (true) {
    let usable = false;

    try {
      for await (const segment of streamSpeech(
        (streamSignal) =>
          readPersonaResponse(
            source(streamSignal, speechOnly, spoken.join(' ')),
            onExpression,
            onMemoryUse,
          ),
        signal,
      )) {
        const text = validateSpokenSegment(segment);

        if (text) {
          validateStyle?.(text, delivered);
          usable = true;
          delivered = true;
          spoken.push(text);
          yield text;
        }
      }

      if (!usable) {
        throw new ProviderInvalidError('O modelo não retornou texto falável.');
      }

      return;
    } catch (error) {
      if (
        !signal.aborted &&
        !providerRecovered &&
        onProviderRecovery &&
        (error instanceof QuotaExceededError ||
          error instanceof ProviderTemporarilyUnavailableError)
      ) {
        providerRecovered = true;
        await onProviderRecovery();
        signal.throwIfAborted();
        speechOnly ||= delivered;
        continue;
      }

      if (
        signal.aborted ||
        delivered ||
        formatRecovered ||
        speechOnly ||
        !(error instanceof ProviderInvalidError)
      ) {
        throw error;
      }

      onExpression({ ...NEUTRAL_EXPRESSION }, false);
      onRecovery();
      formatRecovered = true;
      speechOnly = true;
    }
  }
}
