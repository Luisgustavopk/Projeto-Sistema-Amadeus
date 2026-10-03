import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .startsWith('file:')
    .default('file:./data/amadeus.db'),
});
