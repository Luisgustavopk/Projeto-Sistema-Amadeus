import { z } from 'zod';

export const RoleSchema = z.enum(['llm', 'stt', 'tts']);
export type Role = z.infer<typeof RoleSchema>;
export const DataClassSchema = z.enum(['synthetic', 'personal', 'local-only']);
export type DataClass = z.infer<typeof DataClassSchema>;
const ApiKeyEnvSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const ModelSchema = z.string().regex(/^[a-zA-Z0-9@._:/-]{1,128}$/);
const LlmFallbackSchema = z
  .strictObject({
    adapter: z.enum(['gemini', 'groq', 'cloudflare-ai']),
    model: ModelSchema,
    apiKeyEnv: ApiKeyEnvSchema,
    dataPolicy: z
      .enum(['synthetic-only', 'personal-approved'])
      .default('synthetic-only'),
    policyReviewedAt: z.iso.datetime().optional(),
    policyReference: z.string().url().optional(),
    geminiTier: z.enum(['unpaid', 'paid']).optional(),
    accountId: z
      .string()
      .regex(/^[a-fA-F0-9]{32}$/)
      .optional(),
  })
  .superRefine((provider, ctx) => {
    if (provider.adapter === 'cloudflare-ai' && !provider.accountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cloudflare Workers AI exige o ID da conta.',
      });
    }

    if (provider.adapter !== 'cloudflare-ai' && provider.accountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'ID de conta só se aplica ao Cloudflare Workers AI.',
      });
    }

    if (
      provider.dataPolicy === 'personal-approved' &&
      (!provider.policyReviewedAt || !provider.policyReference)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Dados pessoais exigem revisão da política e referência.',
      });
    }

    if (
      provider.adapter === 'gemini' &&
      provider.dataPolicy === 'personal-approved' &&
      provider.geminiTier !== 'paid'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Gemini sem plano pago não pode processar dados pessoais.',
      });
    }

    if (provider.adapter !== 'gemini' && provider.geminiTier) {
      ctx.addIssue({
        code: 'custom',
        message: 'geminiTier só se aplica ao Gemini.',
      });
    }
  });

export const ProviderSchema = z
  .strictObject({
    adapter: z.enum([
      'disabled',
      'http-json',
      'gemini',
      'groq',
      'cloudflare-ai',
    ]),
    endpoint: z.string().url().optional(),
    apiKeyEnv: ApiKeyEnvSchema.optional(),
    model: z.string().min(1).max(128).optional(),
    accountId: z
      .string()
      .regex(/^[a-fA-F0-9]{32}$/)
      .optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    geminiTier: z.enum(['unpaid', 'paid']).optional(),
    fallbackModel: z
      .string()
      .regex(/^[a-zA-Z0-9._-]{1,128}$/)
      .optional(),
    fallbackProviders: z.array(LlmFallbackSchema).max(2).optional(),
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

    if (p.fallbackModel && p.fallbackProviders?.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use fallbackModel ou fallbackProviders; não configure ambos.',
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

    if (
      (p.adapter === 'groq' || p.adapter === 'cloudflare-ai') &&
      (!p.model || !p.apiKeyEnv || p.endpoint)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Provedores LLM remotos exigem modelo e variável de chave, sem endpoint customizado.',
      });
    }

    if (p.adapter === 'cloudflare-ai' && !p.accountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cloudflare Workers AI exige o ID da conta.',
      });
    }

    if (p.adapter !== 'cloudflare-ai' && p.accountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'ID de conta só se aplica ao Cloudflare Workers AI.',
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

    if (
      p.adapter === 'gemini' &&
      p.dataPolicy === 'personal-approved' &&
      p.geminiTier !== 'paid'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Gemini sem plano pago não pode processar dados pessoais.',
      });
    }

    if (p.adapter !== 'gemini' && p.geminiTier) {
      ctx.addIssue({
        code: 'custom',
        message: 'geminiTier só se aplica ao Gemini.',
      });
    }
  });
export type ProviderConfig = z.infer<typeof ProviderSchema>;
export const ProvidersSchema = z
  .strictObject({
    llm: ProviderSchema,
    stt: ProviderSchema,
    tts: ProviderSchema,
  })
  .superRefine((providers, ctx) => {
    if (
      (providers.llm.fallbackModel ||
        providers.llm.fallbackProviders?.length) &&
      !['gemini', 'groq', 'cloudflare-ai'].includes(providers.llm.adapter)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['llm'],
        message: 'Reservas exigem um provedor LLM remoto.',
      });
    }

    for (const role of ['stt', 'tts'] as const) {
      if (
        providers[role].fallbackModel ||
        providers[role].fallbackProviders?.length
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [role],
          message: 'Reservas de provedor são suportadas somente para LLM.',
        });
      }
    }
  });
export type ProvidersConfig = z.infer<typeof ProvidersSchema>;
export const DEFAULT_PROVIDERS: ProvidersConfig = ProvidersSchema.parse({
  llm: { adapter: 'disabled' },
  stt: { adapter: 'disabled' },
  tts: { adapter: 'disabled' },
});
