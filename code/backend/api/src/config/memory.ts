import { z } from 'zod';
import { fileURLToPath } from 'node:url';

export const MemoryConfigSchema = z.object({
  MEMORY_RERANK_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MEMORY_SEMANTIC_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MEMORY_MODEL_CACHE_DIRECTORY: z
    .string()
    .min(1)
    .default(fileURLToPath(new URL('../../data/models/', import.meta.url))),
});
