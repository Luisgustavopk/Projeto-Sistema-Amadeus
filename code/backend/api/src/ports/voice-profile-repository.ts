import type { VoiceProfile } from '../domain/voice/model.ts';

export interface VoiceProfileRepository {
  active(ownerId: string): Promise<VoiceProfile | null>;
  activate(ownerId: string, profile: VoiceProfile): Promise<void>;
}
export interface VoiceReferenceInspector {
  inspect(
    referenceFile: string,
  ): Promise<{ sha256: string; durationSeconds: number }>;
}
