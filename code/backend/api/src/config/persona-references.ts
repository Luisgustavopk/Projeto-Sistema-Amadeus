import { z } from 'zod';

export const PersonaReferencesConfigSchema = z.object({
  PERSONA_REFERENCES_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  PERSONA_REFERENCE_MAX_EXAMPLES: z.coerce
    .number()
    .int()
    .min(0)
    .max(12)
    .default(6),
  PERSONA_REFERENCE_MAX_LORE: z.coerce.number().int().min(0).max(4).default(2),
  PERSONA_REFERENCE_CHARACTERS: z.coerce
    .number()
    .int()
    .min(0)
    .max(16000)
    .default(6000),
  PERSONA_REFERENCE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(2000)
    .default(1000),
});
