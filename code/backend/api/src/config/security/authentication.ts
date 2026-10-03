import { z } from 'zod';

export const AuthenticationConfigSchema = z.object({
  API_ACCESS_TOKEN: z
    .string()
    .min(32, 'Execute npm run setup para criar uma credencial local.'),
  OWNER_ID: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default('primary'),
});
