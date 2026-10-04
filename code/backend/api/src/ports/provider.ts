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
  content: string;
  systemPrompt?: string;
  dataClass: DataClass;
  maxTokens: number;
  audio?: { pcmBase64: string; sampleRate: 16000; channels: 1 } | undefined;
  voice?: { id: string; referenceFile: string; referenceSha256: string };
};
export type ProviderOutput = {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  audio?: { pcmBase64: string; sampleRate: 16000; channels: 1 };
};

export interface Provider {
  role: Role;
  transport: 'buffered-json' | 'sse';
  nativeStreaming: boolean;
  health(): Promise<{ available: boolean; capabilities: ProviderCapabilities }>;
  stream?(
    input: ProviderInput,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderOutput>;
  execute(input: ProviderInput, signal?: AbortSignal): Promise<ProviderOutput>;
}
