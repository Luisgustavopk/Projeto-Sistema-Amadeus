import { z } from 'zod';
import type { Provider, ProviderOutput } from '../../ports/provider.ts';
import type { ProviderConfig } from '../../domain/providers/model.ts';
import {
  ProviderConfigurationError,
  ProviderInvalidError,
  ProviderTemporarilyUnavailableError,
  ProviderUnavailableError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import { decodeServerSentEvents } from './sse.ts';
import { NO_CAPABILITIES } from './http-json.ts';
import { LocalCompletionEndpointSchema } from '../../domain/providers/local.ts';

const Completion = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      message: z
        .object({ content: z.string().nullable().optional() })
        .optional(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const StreamChunk = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        delta: z
          .object({ content: z.string().nullable().optional() })
          .optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

// Workers AI sometimes emits a numeric text fragment as a JSON number.
// Normalize only that provider's content field; never stringify metadata.
const CloudflareStreamChunk = StreamChunk.extend({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        delta: z
          .object({
            content: z
              .union([z.string(), z.number().finite().transform(String)])
              .nullable()
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

function getCredentials(
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): { key: string; endpoint: string } {
  const key = config.apiKeyEnv ? secrets[config.apiKeyEnv] : undefined;

  if (config.adapter === 'openai-local') {
    const endpoint = LocalCompletionEndpointSchema.parse(config.endpoint);

    if (
      !config.model ||
      config.dataPolicy !== 'local-approved' ||
      (config.apiKeyEnv && !key)
    ) {
      throw new ProviderConfigurationError(
        'Configure o modelo e a credencial local.',
      );
    }

    return { key: key ?? '', endpoint };
  }

  if (!key || !config.model) {
    throw new ProviderConfigurationError(
      'Configure o modelo LLM e sua variável de chave.',
    );
  }

  if (config.adapter === 'mistral' || config.adapter === 'openrouter') {
    if (config.adapter === 'openrouter' && !config.model.endsWith(':free')) {
      throw new ProviderConfigurationError(
        'OpenRouter aceita somente modelos :free.',
      );
    }

    return {
      key,
      endpoint:
        config.adapter === 'mistral'
          ? 'https://api.mistral.ai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions',
    };
  }

  if (config.adapter === 'groq') {
    return {
      key,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    };
  }

  if (config.adapter === 'cloudflare-ai' && config.accountId) {
    return {
      key,
      endpoint:
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}` +
        '/ai/v1/chat/completions',
    };
  }

  throw new ProviderConfigurationError('Configuração LLM inválida.');
}

function mapHttpFailure(status: number, tokenRateLimited = false): Error {
  if (status === 402 || status === 429 || tokenRateLimited) {
    return new QuotaExceededError('Cota ou limite do provedor LLM esgotado.');
  }

  if ([408, 500, 502, 503, 504].includes(status)) {
    return new ProviderTemporarilyUnavailableError(
      'Provedor LLM temporariamente indisponível.',
    );
  }

  if (status === 401 || status === 403) {
    return new ProviderConfigurationError(
      'A chave ou permissão do provedor LLM foi recusada.',
    );
  }

  if ([400, 404, 413, 422].includes(status)) {
    return new ProviderConfigurationError(
      'Modelo ou parâmetros recusados pelo provedor LLM.',
    );
  }

  return new ProviderUnavailableError('Provedor LLM indisponível.');
}

// Groq can report a token rate limit as HTTP 413. Inspect only its bounded,
// structured error code; never expose the remote message or request contents.
async function isTokenRateLimit(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();

  if (!reader) {
    return false;
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const next = await reader.read();

      if (next.done) {
        break;
      }

      bytes += next.value.byteLength;

      if (bytes > 8192) {
        return false;
      }

      chunks.push(next.value);
    }

    const result = z
      .object({
        error: z.object({
          code: z.literal('rate_limit_exceeded'),
          type: z.literal('tokens'),
        }),
      })
      .safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);

    return result.success;
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function throwIfTruncated(finishReason?: string | null) {
  if (finishReason === 'length') {
    throw new ProviderInvalidError(
      'O provedor LLM atingiu o limite de tokens antes de completar a resposta.',
    );
  }
}

export function createOpenAiCompatibleProvider(
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  const { key, endpoint } = getCredentials(config, secrets);

  async function open(
    input: { content: string; maxTokens: number; systemPrompt?: string },
    stream: boolean,
    signal?: AbortSignal,
  ) {
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            ...(input.systemPrompt
              ? [{ role: 'system', content: input.systemPrompt }]
              : []),
            { role: 'user', content: input.content },
          ],
          max_tokens: input.maxTokens,
          ...(config.adapter === 'groq' && config.model === 'qwen/qwen3.8-27b'
            ? { reasoning_effort: 'none', include_reasoning: false }
            : {}),
          ...(config.adapter === 'groq' &&
          /^openai\/gpt-oss-(?:20b|120b)$/u.test(config.model ?? '')
            ? {
                reasoning_effort: config.thinkingLevel ?? 'low',
                include_reasoning: false,
              }
            : {}),
          ...(stream && config.adapter === 'groq'
            ? { stream_options: { include_usage: true } }
            : {}),
          ...(config.adapter === 'openrouter'
            ? {
                provider: {
                  max_price: { prompt: 0, completion: 0 },
                  data_collection: 'deny',
                  sort: 'latency',
                },
                reasoning: { enabled: false, exclude: true },
              }
            : {}),
          stream,
        }),
        redirect: 'error',
        signal: AbortSignal.any([
          signal ?? new AbortController().signal,
          AbortSignal.timeout(30000),
        ]),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      throw new ProviderTemporarilyUnavailableError(
        'Falha de rede ao acessar o provedor LLM.',
      );
    }

    if (!response.ok) {
      const tokenRateLimited =
        config.adapter === 'groq' && response.status === 413
          ? await isTokenRateLimit(response)
          : false;

      if (!response.body?.locked) {
        await response.body?.cancel();
      }

      // Free endpoints can disappear or fail the data-policy filter. Try the
      // next explicit free model rather than treating this as invalid credentials.
      const error = mapHttpFailure(
        config.adapter === 'openrouter' && response.status === 404
          ? 503
          : response.status,
        tokenRateLimited,
      );

      if (
        config.adapter === 'openrouter' &&
        error instanceof QuotaExceededError
      ) {
        // Platform rate-limit responses carry X-RateLimit-* headers; an upstream
        // provider's 429 need not exhaust other providers or free model variants.
        error.quotaScope =
          response.status === 402 || response.headers.has('x-ratelimit-limit')
            ? 'account'
            : 'model';
      }

      if (
        error instanceof QuotaExceededError ||
        error instanceof ProviderTemporarilyUnavailableError
      ) {
        const value = response.headers.get('retry-after');

        if (value) {
          const seconds = Number(value);
          const milliseconds = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(value) - Date.now();

          if (Number.isFinite(milliseconds) && milliseconds >= 0) {
            error.retryAfterMs = Math.min(milliseconds, 31 * 86400000);
          }
        }
      }

      throw error;
    }

    return response;
  }

  return {
    role: 'llm',
    transport: 'sse',
    nativeStreaming: true,
    async health() {
      if (config.adapter === 'cloudflare-ai') {
        return {
          available: true,
          capabilities: {
            ...NO_CAPABILITIES,
            incrementalGeneration: true,
            progressiveDelivery: true,
          },
        };
      }

      try {
        const response = await fetch(
          endpoint.replace('/chat/completions', '/models'),
          {
            headers: { authorization: `Bearer ${key}` },
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
          },
        );
        await response.body?.cancel();

        if (!response.ok) {
          return { available: false, capabilities: NO_CAPABILITIES };
        }
      } catch {
        return { available: false, capabilities: NO_CAPABILITIES };
      }

      return {
        available: true,
        capabilities: {
          ...NO_CAPABILITIES,
          incrementalGeneration: true,
          progressiveDelivery: true,
        },
      };
    },
    async *stream(input, signal): AsyncIterable<ProviderOutput> {
      const response = await open(input, true, signal);
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let deliveredContent = false;

      try {
        for await (const value of decodeServerSentEvents(response)) {
          signal?.throwIfAborted();

          if (config.adapter === 'openrouter') {
            const failure = z
              .object({ error: z.object({ code: z.number().int() }) })
              .safeParse(value);

            if (failure.success) {
              throw mapHttpFailure(
                failure.data.error.code === 404 ? 503 : failure.data.error.code,
              );
            }
          }

          const chunk = (
            config.adapter === 'cloudflare-ai'
              ? CloudflareStreamChunk
              : StreamChunk
          ).parse(value);
          const choice = chunk.choices?.[0];
          throwIfTruncated(choice?.finish_reason);

          inputTokens = chunk.usage?.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage?.completion_tokens ?? outputTokens;
          const content = choice?.delta?.content ?? '';

          if (content) {
            deliveredContent = true;
            yield { content, inputTokens: null, outputTokens: null };
          }
        }
      } catch (error) {
        if (signal?.aborted || error instanceof ApplicationError) {
          throw error;
        }

        throw new ProviderTemporarilyUnavailableError(
          'Streaming interrompido pelo provedor LLM.',
        );
      }

      if (!deliveredContent) {
        throw new ProviderInvalidError('Provedor LLM não retornou texto.');
      }

      if (inputTokens !== null || outputTokens !== null) {
        yield { content: '', inputTokens, outputTokens };
      }
    },
    async execute(input, signal): Promise<ProviderOutput> {
      try {
        const response = await open(input, false, signal);
        const reader = response.body?.getReader();

        if (!reader) {
          throw new ProviderInvalidError();
        }

        const chunks: Uint8Array[] = [];
        let bytes = 0;

        try {
          while (true) {
            const next = await reader.read();

            if (next.done) {
              break;
            }

            bytes += next.value.byteLength;

            if (bytes > 131072) {
              throw new ProviderInvalidError(
                'Resposta do provedor LLM excedeu o limite.',
              );
            }

            chunks.push(next.value);
          }
        } finally {
          await reader.cancel();
        }

        const completion = Completion.parse(
          JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
        );
        const choice = completion.choices[0];
        throwIfTruncated(choice?.finish_reason);
        const content = choice?.message?.content ?? '';

        if (!content.trim()) {
          throw new ProviderInvalidError('Provedor LLM não retornou texto.');
        }

        return {
          content,
          inputTokens: completion.usage?.prompt_tokens ?? null,
          outputTokens: completion.usage?.completion_tokens ?? null,
        };
      } catch (error) {
        if (
          error instanceof ProviderConfigurationError ||
          error instanceof ProviderInvalidError ||
          error instanceof ProviderTemporarilyUnavailableError ||
          error instanceof ProviderUnavailableError ||
          error instanceof QuotaExceededError ||
          signal?.aborted
        ) {
          throw error;
        }

        throw new ProviderInvalidError('Resposta inválida do provedor LLM.');
      }
    },
  };
}

export function createGroqProvider(
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  if (config.adapter !== 'groq') {
    throw new ProviderConfigurationError('Adaptador Groq inválido.');
  }

  return createOpenAiCompatibleProvider(config, secrets);
}

export function createCloudflareAiProvider(
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  if (config.adapter !== 'cloudflare-ai') {
    throw new ProviderConfigurationError(
      'Adaptador Cloudflare Workers AI inválido.',
    );
  }

  return createOpenAiCompatibleProvider(config, secrets);
}
