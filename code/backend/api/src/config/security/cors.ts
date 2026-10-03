import { z } from 'zod';

const OriginSchema = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) {
      return false;
    }

    const url = new URL(value);

    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  });

export const CorsConfigSchema = z.object({
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(OriginSchema).max(16)),
});
