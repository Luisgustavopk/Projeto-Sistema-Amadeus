import type { PersonaReference } from '../domain/persona/reference.ts';

export interface PersonaReferenceRepository {
  synchronize(entries: PersonaReference[]): Promise<void>;
  documents(): Promise<PersonaReference[]>;
  vectors(model: string): Promise<Map<string, number[]>>;
  saveVector(
    id: string,
    hash: string,
    model: string,
    vector: number[],
  ): Promise<void>;
}

export type ReferenceSelection = {
  examples: PersonaReference[];
  lore: PersonaReference[];
  characters: number;
  state: 'ready' | 'disabled' | 'unindexed' | 'degraded' | 'timeout';
};

export interface PersonaReferenceRetriever {
  retrieve(
    query: string,
    signal: AbortSignal,
    options?: {
      /** Current utterance, without context labels, used by the reranker. */
      focus?: string;
      maxExamples?: number;
      maxLore?: number;
      characters?: number;
      waitMs?: number;
    },
  ): Promise<ReferenceSelection>;
}
