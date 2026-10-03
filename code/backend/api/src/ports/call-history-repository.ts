import type { SpeechSegment, TurnStatus } from '../domain/voice/model.ts';
import type { DataClass } from '../domain/providers/model.ts';

export type StoredTurn = {
  userText: string;
  generatedText: string;
  dataClass: DataClass;
};
export interface CallHistoryRepository {
  startSession(input: {
    id: string;
    conversationId: string;
    ownerId: string;
    voiceProfileId: string | null;
  }): Promise<void>;
  endSession(
    sessionId: string,
    state: 'closed' | 'disconnected',
  ): Promise<void>;
  beginTurn(input: {
    id: string;
    sessionId: string;
    conversationId: string;
    clientTurnId: number;
    responseId: string;
    dataClass: DataClass;
  }): Promise<void>;
  updateTurn(
    responseId: string,
    values: { userText?: string; generatedText?: string; status?: TurnStatus },
  ): Promise<void>;
  recent(
    conversationId: string,
    ownerId: string,
    limit: number,
  ): Promise<StoredTurn[]>;
  addSegment(segment: SpeechSegment): Promise<void>;
  setAudio(segmentId: string, sampleCount: number): Promise<void>;
  acknowledge(input: {
    sessionId: string;
    responseId: string;
    segmentId: string;
    playedSamples: number;
  }): Promise<boolean>;
}
