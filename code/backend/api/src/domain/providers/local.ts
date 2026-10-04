import { z } from 'zod';

export const LocalCompletionEndpointSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);

    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.pathname === '/v1/chat/completions' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'LLM local exige HTTP de loopback em /v1/chat/completions.');

export const LocalLlmSchema = z.strictObject({
  adapter: z.literal('openai-local'),
  endpoint: LocalCompletionEndpointSchema,
  model: z.string().regex(/^[a-zA-Z0-9@._:/-]{1,128}$/),
  apiKeyEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
    .optional(),
  dataPolicy: z.literal('local-approved'),
});
