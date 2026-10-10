import type { CallState } from '../domain/voice/model.ts';
import type { Expression } from '../domain/persona/expression.ts';
import type { describeDelivery } from '../domain/persona/expression.ts';

export type VoiceEvent =
  | { type: 'presence.offer'; offerId: string; kind: 'greeting' | 'initiative' }
  | { type: 'presence.cancelled'; offerId: string; turnId: number }
  | {
      type: 'audio.abort';
      turnId: number;
      responseId: string;
      segmentId: string;
    }
  | {
      type: 'audio.start';
      turnId: number;
      responseId: string;
      segmentId: string;
      sampleRate: 16000 | 24000;
    }
  | {
      type: 'audio.end';
      turnId: number;
      responseId: string;
      segmentId: string;
      sampleCount: number;
      frameCount: number;
    }
  | (Expression &
      ReturnType<typeof describeDelivery> & {
        type: 'reply.expression';
        turnId: number;
        responseId: string;
        segmentId: string;
        position: number;
        personaVersion: string;
        voiceProfileId: string | null;
        metadataValid: boolean;
        phase?: 'initial' | 'update';
        deliveryApplied: boolean;
      })
  | { type: 'state'; turnId: number; state: CallState }
  | { type: 'transcript.final'; turnId: number; text: string }
  | { type: 'transcript.partial'; turnId: number; text: string }
  | { type: 'reply.start'; turnId: number; responseId: string }
  | {
      type: 'reply.text';
      turnId: number;
      responseId: string;
      segmentId: string;
      position: number;
      text: string;
    }
  | {
      type: 'audio.segment';
      turnId: number;
      responseId: string;
      segmentId: string;
      sampleCount: number;
      frameCount: number;
      sampleRate: 16000 | 24000;
    }
  | { type: 'reply.done'; turnId: number; responseId: string }
  | {
      type: 'reply.wait';
      turnId: number;
      responseId: string;
      reason: 'provider-fallback';
      text: string;
    }
  | { type: 'interrupted'; turnId: number; responseId: string }
  | { type: 'quota.warning'; turnId: number; role: 'llm' | 'stt' | 'tts' }
  | {
      type: 'error';
      code: string;
      recoverable: boolean;
      turnId?: number;
    };

export interface VoiceSink {
  send(event: VoiceEvent): void;
  audio(input: {
    turnId: number;
    responseId: string;
    segmentId: string;
    pcm: Uint8Array;
    sampleRate: 16000 | 24000;
    signal: AbortSignal;
  }): Promise<void>;
  audioStream?(input: {
    turnId: number;
    responseId: string;
    segmentId: string;
    sampleRate: 16000 | 24000;
    chunks: AsyncIterable<Uint8Array>;
    signal: AbortSignal;
  }): Promise<number>;
}
