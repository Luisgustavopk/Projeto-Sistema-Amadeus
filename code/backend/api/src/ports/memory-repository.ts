import type {
  FactInput,
  MemoryFact,
  MemoryJob,
  MemoryPolicy,
  MemorySource,
  MemorySummary,
  SuggestedFact,
} from '../domain/memory/model.ts';
import type { DataClass } from '../domain/providers/model.ts';

export interface MemoryRepository {
  policy(): Promise<MemoryPolicy>;
  updatePolicy(input: MemoryPolicy): Promise<MemoryPolicy>;
  facts(): Promise<MemoryFact[]>;
  consolidate(): Promise<{ merged: number; skipped: number }>;
  candidateFacts(terms: string[], dataClass: DataClass): Promise<MemoryFact[]>;
  createFact(input: FactInput): Promise<MemoryFact>;
  editFact(
    id: string,
    version: number,
    input: FactInput & { status: 'suggested' | 'confirmed' },
  ): Promise<MemoryFact>;
  forgetFact(
    id: string,
    version: number,
    eraseSources: boolean,
  ): Promise<{ originalHistoryRetained: boolean }>;
  summaries(conversationId?: string): Promise<MemorySummary[]>;
  permitSummary(
    id: string,
    version: number,
    permission: 'local-only' | 'eligible',
  ): Promise<MemorySummary>;
  enqueue(conversationId?: string): Promise<void>;
  recover(): Promise<void>;
  claim(now: number): Promise<MemoryJob | null>;
  previousSources(job: MemoryJob): Promise<MemorySource[]>;
  complete(
    job: MemoryJob,
    facts: SuggestedFact[],
    summary: string,
    origin: 'local-extraction' | 'llm-extraction',
  ): Promise<boolean>;
  defer(
    job: MemoryJob,
    code: string,
    nextRun: number,
    countAttempt: boolean,
  ): Promise<void>;
  jobs(): Promise<
    {
      id: string;
      conversationId: string;
      status: string;
      attempts: number;
      nextRun: number;
      lastError: string | null;
    }[]
  >;
  listConversations(): Promise<{ id: string; createdAt: number }[]>;
  conversation(id: string): Promise<{ id: string; turns: MemorySource[] }>;
  deleteConversation(id: string): Promise<void>;
  rebuild(conversationId: string): Promise<void>;
  purgeExpired(now: number): Promise<void>;
  exportData(): Promise<unknown>;
}
