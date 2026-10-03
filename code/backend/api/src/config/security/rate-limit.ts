import { z } from 'zod';

export const RateLimitConfigSchema = z.object({
  HTTP_REQUESTS_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(10)
    .max(10000)
    .default(120),
});
