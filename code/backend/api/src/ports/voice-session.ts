import type { CallState } from '../domain/voice/model.ts';

export type VoiceEvent =
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
      sampleRate: 16000;
    }
  | { type: 'reply.done'; turnId: number; responseId: string }
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
    signal: AbortSignal;
  }): Promise<void>;
}
