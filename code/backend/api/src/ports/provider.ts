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
  dataClass: DataClass;
  maxTokens: number;
};
export type ProviderOutput = {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface Provider {
  role: Role;
  transport: 'buffered-json';
  nativeStreaming: false;
  health(): Promise<{ available: boolean; capabilities: ProviderCapabilities }>;
  execute(input: ProviderInput, signal?: AbortSignal): Promise<ProviderOutput>;
}
