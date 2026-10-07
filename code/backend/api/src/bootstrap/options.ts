import type { ServerOptions } from 'node:https';
import type { Config } from '../config/index.ts';
import type { openDatabase } from '../adapters/database/index.ts';
import type { MemoryEmbeddings } from '../ports/memory-embeddings.ts';
import type { MemoryReranker } from '../ports/memory-reranker.ts';
import type { PersonaDecisionClient } from '../ports/persona-decision.ts';

export type AppOptions = {
  token: string;
  logLevel?: string;
  config?: Config;
  database?: Awaited<ReturnType<typeof openDatabase>>;
  tls?: ServerOptions;
  secrets?: NodeJS.ProcessEnv;
  logStream?: { write: (message: string) => void };
  memoryEmbeddings?: MemoryEmbeddings;
  memoryReranker?: MemoryReranker;
  personaDecisionClient?: PersonaDecisionClient;
};
