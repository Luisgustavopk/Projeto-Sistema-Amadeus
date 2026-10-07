import type {
  DataClass,
  Role,
  ProviderConfig,
} from '../domain/providers/model.ts';

export type ProviderFactory = (role: Role, config: ProviderConfig) => Provider;
export type ProviderCapabilities = {
  incrementalGeneration: boolean;
  progressiveDelivery: boolean;
  vision: boolean;
  customVoice: boolean;
  testedVoiceControls: string[];
};
export type ProviderInput = {
  history?: { role: 'user' | 'assistant'; content: string }[];
  sessionId?: string;
  content: string;
  systemPrompt?: string;
  dataClass: DataClass;
  purpose?: 'conversation' | 'memory';
  memoryTask?: 'extract' | 'review' | 'reconcile' | 'answer' | 'verify-answer';
  maxTokens: number;
  audio?: { pcmBase64: string; sampleRate: 16000; channels: 1 } | undefined;
  voice?: { id: string; referenceFile: string; referenceSha256: string };
  speechContextId?: string;
};
export type ProviderOutput = {
  cache?: {
    readTokens: number | null;
    writeTokens: number | null;
    costUsd: number | null;
    provider: string | null;
    generationId: string | null;
  };
  progressiveAudio?: boolean;
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  audio?: { pcmBase64: string; sampleRate: 16000 | 24000; channels: 1 };
};

export interface Provider {
  role: Role;
  transport: 'buffered-json' | 'sse' | 'websocket';
  nativeStreaming: boolean;
  health(): Promise<{ available: boolean; capabilities: ProviderCapabilities }>;
  stream?(
    input: ProviderInput,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderOutput>;
  streamAudio?(
    input: ProviderInput,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderOutput>;
  closeSpeech?(contextId: string): void;
  execute(input: ProviderInput, signal?: AbortSignal): Promise<ProviderOutput>;
}
