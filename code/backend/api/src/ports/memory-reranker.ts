export interface MemoryReranker {
  key: string;
  rank(query: string, documents: string[]): Promise<number[]>;
  close(): Promise<void>;
}
