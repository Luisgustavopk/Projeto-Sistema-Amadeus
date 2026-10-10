import { z } from 'zod';
import { LocalLlmSchema, LocalCompletionEndpointSchema } from './local.ts';
import { OpenRouterPaidSchema, validOpenRouterPayment } from './openrouter.ts';
import { JEV_ENDPOINT, JEV_MODEL } from '../persona/tone.ts';

export const RoleSchema = z.enum(['llm', 'stt', 'tts']);
export type Role = z.infer<typeof RoleSchema>;
export const DataClassSchema = z.enum(['synthetic', 'personal', 'local-only']);
export type DataClass = z.infer<typeof DataClassSchema>;
const ApiKeyEnvSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const ModelSchema = z.string().regex(/^[a-zA-Z0-9@._:/-]{1,128}$/);
const LocalSpeechFallbackSchema = z.strictObject({
  adapter: z.literal('http-json'),
  endpoint: z.string().url(),
  apiKeyEnv: ApiKeyEnvSchema,
  model: ModelSchema.optional(),
  dataPolicy: z.literal('local-approved'),
});
const LlmFallbackSchema = z
  .strictObject({
    adapter: z.enum([
      'gemini',
      'groq',
      'cloudflare-ai',
      'mistral',
      'openrouter',
    ]),
    model: ModelSchema,
    apiKeyEnv: ApiKeyEnvSchema,
    limits: z
      .strictObject({
        requestsPerDay: z.number().int().min(0).max(100000).default(0),
        tokensPerDay: z.number().int().min(0).max(100000000).default(0),
        source: z.enum(['operator', 'provider']).default('operator'),
      })
      .optional(),
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
    if (
      provider.adapter === 'openrouter' &&
      !provider.model.endsWith(':free')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'OpenRouter exige um modelo explícito com sufixo :free.',
      });
    }

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
    openRouterPaid: OpenRouterPaidSchema.optional(),
    adapter: z.enum([
      'disabled',
      'http-json',
      'openai-local',
      'gemini',
      'groq',
      'cloudflare-ai',
      'mistral',
      'openrouter',
      'deepgram',
      'cartesia',
      'zai',
    ]),
    endpoint: z.string().url().optional(),
    apiKeyEnv: ApiKeyEnvSchema.optional(),
    model: z.string().min(1).max(128).optional(),
    voiceId: z.uuid().optional(),
    fallbackVoiceId: z.uuid().optional(),
    fallbackVoiceApiKeyEnv: ApiKeyEnvSchema.optional(),
    speechFallback: LocalSpeechFallbackSchema.optional(),
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
    fallbackProviders: z.array(LlmFallbackSchema).max(8).optional(),
    localProvider: LocalLlmSchema.optional(),
    localRouting: z.enum(['hybrid', 'cloud-first']).optional(),
    dataPolicy: z
      .enum(['synthetic-only', 'personal-approved', 'local-approved'])
      .default('synthetic-only'),
    policyReviewedAt: z.iso.datetime().optional(),
    policyReference: z.string().url().optional(),
    limits: z
      .strictObject({
        enforced: z.boolean().optional(),
        requestsPerDay: z.number().int().min(0).max(100000).default(0),
        tokensPerDay: z.number().int().min(0).max(100000000).default(0),
        source: z.enum(['operator', 'provider']).default('operator'),
      })
      .default({ requestsPerDay: 0, tokensPerDay: 0, source: 'operator' }),
  })
  .superRefine((p, ctx) => {
    if (
      p.limits.enforced === false &&
      !(p.adapter === 'openrouter' && p.openRouterPaid) &&
      !(
        p.adapter === 'http-json' &&
        p.endpoint === JEV_ENDPOINT &&
        p.model === JEV_MODEL
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Limites locais só podem ser desativados para modelos pagos aprovados ou contabilização Jev.',
      });
    }

    if (p.localRouting && !p.localProvider) {
      ctx.addIssue({
        code: 'custom',
        message: 'localRouting exige um provedor local configurado.',
      });
    }

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
      (!['http-json', 'openai-local'].includes(p.adapter) ||
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

    if (
      p.adapter === 'openai-local' &&
      (!p.model ||
        !LocalCompletionEndpointSchema.safeParse(p.endpoint).success ||
        p.dataPolicy !== 'local-approved')
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'LLM local exige modelo, endpoint de loopback e política local-approved.',
      });
    }

    if (
      p.localProvider &&
      !['gemini', 'groq', 'cloudflare-ai', 'mistral', 'openrouter'].includes(
        p.adapter,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Roteamento híbrido exige principal remoto e LLM local separado.',
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
      ['groq', 'cloudflare-ai', 'mistral', 'openrouter', 'zai'].includes(
        p.adapter,
      ) &&
      (!p.model || !p.apiKeyEnv || p.endpoint)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Provedores LLM remotos exigem modelo e variável de chave, sem endpoint customizado.',
      });
    }

    if (!validOpenRouterPayment(p)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'OpenRouter exige :free ou Llama 3.3 com autorização explícita e teto de preço.',
      });
    }

    if (p.adapter === 'zai' && p.model !== 'glm-4.7-flash') {
      ctx.addIssue({
        code: 'custom',
        message: 'Z.ai aceita somente o modelo gratuito glm-4.7-flash.',
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

    if (
      p.adapter === 'deepgram' &&
      (!['nova-2', 'nova-3'].includes(p.model ?? '') ||
        !p.apiKeyEnv ||
        p.endpoint ||
        p.voiceId)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Deepgram STT exige o modelo nova-2 ou nova-3 e uma variável de chave.',
      });
    }

    if (
      p.adapter === 'cartesia' &&
      (p.model !== 'sonic-3.6' || !p.apiKeyEnv || !p.voiceId || p.endpoint)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Cartesia TTS exige o modelo sonic-3.6, uma voz e uma variável de chave.',
      });
    }

    if (p.voiceId && p.adapter !== 'cartesia') {
      ctx.addIssue({
        code: 'custom',
        message: 'ID de voz só se aplica ao Cartesia TTS.',
      });
    }

    if (
      p.fallbackVoiceId &&
      (p.adapter !== 'cartesia' || p.fallbackVoiceId === p.voiceId)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Voz reserva exige Cartesia e deve diferir da principal.',
      });
    }

    if (p.speechFallback && !['deepgram', 'cartesia'].includes(p.adapter)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Fallback local só se aplica aos provedores de fala remotos.',
      });
    }

    if (p.fallbackVoiceApiKeyEnv && !p.fallbackVoiceId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Credencial da voz reserva exige fallbackVoiceId.',
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
      !['gemini', 'groq', 'cloudflare-ai', 'mistral', 'openrouter'].includes(
        providers.llm.adapter,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['llm'],
        message: 'Reservas exigem um provedor LLM remoto.',
      });
    }

    for (const role of ['stt', 'tts'] as const) {
      if (
        providers[role].openRouterPaid ||
        providers[role].fallbackModel ||
        providers[role].fallbackProviders?.length ||
        providers[role].localProvider ||
        providers[role].adapter === 'openai-local'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [role],
          message: 'Reservas de provedor são suportadas somente para LLM.',
        });
      }
    }

    if (
      providers.llm.speechFallback ||
      providers.llm.voiceId ||
      ['deepgram', 'cartesia'].includes(providers.llm.adapter)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['llm'],
        message: 'Adaptadores de fala não podem ser usados pelo LLM.',
      });
    }

    if (providers.stt.adapter === 'cartesia') {
      ctx.addIssue({
        code: 'custom',
        path: ['stt'],
        message: 'Cartesia é suportado somente como provedor TTS.',
      });
    }

    if (providers.tts.adapter === 'deepgram') {
      ctx.addIssue({
        code: 'custom',
        path: ['tts'],
        message: 'Deepgram é suportado somente como provedor STT.',
      });
    }

    for (const role of ['stt', 'tts'] as const) {
      const fallback = providers[role].speechFallback;

      if (!fallback) {
        continue;
      }

      const url = new URL(fallback.endpoint);

      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.protocol !== 'http:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        providers[role].adapter === 'disabled'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [role, 'speechFallback'],
          message:
            'Fallback de fala exige endpoint HTTP local e um provedor remoto ativo.',
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
