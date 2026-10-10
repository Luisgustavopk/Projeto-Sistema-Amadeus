import type { PersonaTone } from '../domain/persona/tone.ts';

export type MemoryDecisionInput = {
  state: {
    question: string;
    reply: string;
    memories: string;
    recentConversation: string;
  };
  instructions: string;
  criteria: Record<'supported' | 'unsupported' | 'uncertain', string>;
};

export type PersonaDecisionInput = {
  state: { currentUserText: string; recentConversation: string };
  instructions: string;
  criteria: Record<PersonaTone, string>;
  clarity?: {
    instructions: string;
    criteria: Record<'clear' | 'clarify' | 'uncertain', string>;
  };
};

export interface PersonaDecisionClient {
  reviewMemory?: (
    input: MemoryDecisionInput,
    signal: AbortSignal,
  ) => Promise<{
    verdict: 'supported' | 'unsupported' | 'uncertain';
    confidence: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
  decide(
    input: PersonaDecisionInput,
    signal: AbortSignal,
  ): Promise<{
    tone: PersonaTone;
    clarity?: { choice: 'clear' | 'clarify' | 'uncertain'; confidence: number };
    confidence: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}
