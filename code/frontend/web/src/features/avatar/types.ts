import type { useLive2D } from './hooks/useLive2D';
import type { useVoicePreview } from '../voice/hooks/useVoicePreview';
export interface AvatarStatus {
  state: 'loading' | 'ready' | 'error';
  message?: string;
}
export interface AvatarRuntime {
  load(): Promise<boolean>;
  configure(value: { zoom: number; tracking: boolean }): void;
  setActive(value: boolean): void;
  expression(name: string | null): Promise<boolean>;
  speak(duration: number): void;
  stopSpeaking(): void;
  destroy(): void;
}
export type AvatarController = ReturnType<typeof useLive2D>;
export type VoicePreview = ReturnType<typeof useVoicePreview>;
