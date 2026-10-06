export interface MemoryEmbeddings {
  readonly key: string;
  embed(texts: string[], kind: 'query' | 'passage'): Promise<number[][]>;
  close(): Promise<void>;
}
