import { z } from 'zod';

export const RoleSchema = z.enum(['llm', 'stt', 'tts']);
export type Role = z.infer<typeof RoleSchema>;
export const DataClassSchema = z.enum(['synthetic', 'personal', 'local-only']);
export type DataClass = z.infer<typeof DataClassSchema>;
export const ProviderSchema = z
  .strictObject({
    adapter: z.enum(['disabled', 'http-json', 'gemini']),
    endpoint: z.string().url().optional(),
    apiKeyEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
    model: z.string().min(1).max(128).optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    fallbackModel: z
      .string()
      .regex(/^[a-zA-Z0-9._-]{1,128}$/)
      .optional(),
    dataPolicy: z
      .enum(['synthetic-only', 'personal-approved', 'local-approved'])
      .default('synthetic-only'),
    policyReviewedAt: z.iso.datetime().optional(),
    policyReference: z.string().url().optional(),
    limits: z
      .strictObject({
        requestsPerDay: z.number().int().min(0).max(100000).default(0),
        tokensPerDay: z.number().int().min(0).max(100000000).default(0),
        source: z.enum(['operator', 'provider']).default('operator'),
      })
      .default({ requestsPerDay: 0, tokensPerDay: 0, source: 'operator' }),
  })
  .superRefine((p, ctx) => {
    if (
      p.fallbackModel &&
      (p.adapter !== 'gemini' || p.fallbackModel === p.model)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Modelo reserva exige Gemini e deve diferir do modelo principal.',
      });
    }

    if (
      p.dataPolicy === 'local-approved' &&
      (p.adapter !== 'http-json' ||
        !p.endpoint ||
        !URL.canParse(p.endpoint) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(
          new URL(p.endpoint).hostname,
        ))
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Processamento local aprovado exige endpoint de loopback e adaptador HTTP.',
      });
    }

    if (p.adapter === 'gemini' && (!p.model || !p.apiKeyEnv || p.endpoint)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Gemini exige modelo e variável de chave, sem endpoint customizado.',
      });
    }

    if (p.adapter === 'http-json' && !p.endpoint) {
      ctx.addIssue({
        code: 'custom',
        message: 'O adaptador HTTP exige endpoint.',
      });
    }

    if (p.endpoint && URL.canParse(p.endpoint)) {
      const url = new URL(p.endpoint);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      ) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Endpoint exige HTTPS, exceto loopback, sem credenciais, query ou fragmento.',
        });
      }
    }

    if (
      p.dataPolicy === 'personal-approved' &&
      (!p.policyReviewedAt || !p.policyReference)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Dados pessoais exigem revisão da política e referência.',
      });
    }
  });
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export const ProvidersSchema = z.strictObject({
  llm: ProviderSchema,
  stt: ProviderSchema,
  tts: ProviderSchema,
});
export type ProvidersConfig = z.infer<typeof ProvidersSchema>;
export const DEFAULT_PROVIDERS: ProvidersConfig = ProvidersSchema.parse({
  llm: { adapter: 'disabled' },
  stt: { adapter: 'disabled' },
  tts: { adapter: 'disabled' },
});
