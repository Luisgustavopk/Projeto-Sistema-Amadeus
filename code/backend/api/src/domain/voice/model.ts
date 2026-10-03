export type VoiceProfile = {
  id: string;
  name: string;
  referenceFile: string;
  referenceSha256: string;
  createdAt: string;
};
export type CallState =
  'idle' | 'listening' | 'thinking' | 'speaking' | 'cancelling' | 'error';
export type TurnStatus = 'processing' | 'completed' | 'interrupted' | 'failed';
export type SpeechSegment = {
  id: string;
  responseId: string;
  position: number;
  text: string;
};
export type AudioClip = { pcmBase64: string; sampleRate: 16000; channels: 1 };
