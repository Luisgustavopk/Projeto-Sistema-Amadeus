import type { AudioTurnBuffer } from '../../domain/voice/audio-buffer.ts';
import type { AudioClip } from '../../domain/voice/model.ts';

// Recognition during capture only decides barge-in. The complete utterance
// is transcribed separately at speech.end and is the sole input to the LLM.
export function createSpeechPreview(input: {
  enabled: () => boolean;
  transcribe: (
    turnId: number,
    audio: AudioClip,
    signal: AbortSignal,
  ) => Promise<string>;
  confirmed: (turnId: number, text: string) => void;
}) {
  let capture: {
    turnId: number;
    abort: AbortController;
    inFlight: boolean;
    recognized: boolean;
    nextFrame: number;
  } | null = null;
  const pending = new Set<Promise<void>>();

  const cancel = () => {
    capture?.abort.abort();
    capture = null;
  };

  return {
    start(turnId: number) {
      cancel();
      capture = {
        turnId,
        abort: new AbortController(),
        inFlight: false,
        recognized: false,
        nextFrame: 40,
      };
    },
    append(buffer: AudioTurnBuffer) {
      const current = capture;

      if (
        !current ||
        current.recognized ||
        current.inFlight ||
        buffer.frameCount < current.nextFrame ||
        !input.enabled()
      ) {
        return;
      }

      current.inFlight = true;
      current.nextFrame = buffer.frameCount + 40;
      const recognition = input
        .transcribe(
          current.turnId,
          {
            pcmBase64: Buffer.from(buffer.snapshot()).toString('base64'),
            sampleRate: 16000,
            channels: 1,
          },
          current.abort.signal,
        )
        .then((text) => {
          if (
            capture !== current ||
            current.abort.signal.aborted ||
            !/[\p{L}\p{N}]/u.test(text) ||
            !input.enabled()
          ) {
            return;
          }

          current.recognized = true;
          input.confirmed(current.turnId, text);
        })
        .catch(() => {
          // Noise, a busy recognizer or an obsolete preview cannot stop audio.
          // The final transcription remains responsible for reporting failures.
        })
        .finally(() => {
          current.inFlight = false;
          pending.delete(recognition);
        });
      pending.add(recognition);
    },
    cancel,
    async close() {
      cancel();
      await Promise.allSettled([...pending]);
    },
  };
}
