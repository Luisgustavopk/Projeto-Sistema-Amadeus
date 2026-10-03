import { z } from 'zod';
import type { Provider } from '../../ports/provider.ts';
import type { ProviderConfig } from '../../domain/providers/model.ts';
import {
  QuotaExceededError,
  ProviderConfigurationError,
  ProviderUnavailableError,
  ProviderTemporarilyUnavailableError,
  ProviderInvalidError,
} from '../../domain/errors/providers.ts';
import { decodeServerSentEvents } from './sse.ts';
import { NO_CAPABILITIES } from './http-json.ts';

const Output = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      totalTokenCount: z.number().int().nonnegative().optional(),
      thoughtsTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export function createGeminiProvider(
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  const key = config.apiKeyEnv ? secrets[config.apiKeyEnv] : undefined;

  if (!key || !config.model || !/^[a-zA-Z0-9._-]+$/.test(config.model)) {
    throw new ProviderConfigurationError(
      'Configure modelo Gemini e sua variável de chave.',
    );
  }

  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(config.model);

  async function open(suffix: string, body?: unknown, signal?: AbortSignal) {
    const response = await fetch(endpoint + suffix, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key!, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(30000),
      ]),
    });

    if (!response.ok) {
      await response.body?.cancel();

      if (response.status === 429) {
        throw new QuotaExceededError('Cota remota do Gemini esgotada.');
      }

      if ([502, 503, 504].includes(response.status)) {
        throw new ProviderTemporarilyUnavailableError(
          'Gemini temporariamente indisponível. Tente novamente mais tarde.',
        );
      }

      throw new ProviderUnavailableError('Gemini indisponível.');
    }

    return response;
  }

  async function request(suffix: string, body?: unknown, signal?: AbortSignal) {
    const response = await open(suffix, body, signal);
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

        bytes += next.value.length;

        if (bytes > 131072) {
          throw new ProviderInvalidError();
        }

        chunks.push(next.value);
      }

      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally {
      await reader.cancel();
    }
  }

  return {
    role: 'llm',
    transport: 'sse',
    nativeStreaming: true,
    async health() {
      try {
        await request('');

        return {
          available: true,
          capabilities: {
            ...NO_CAPABILITIES,
            incrementalGeneration: true,
            progressiveDelivery: true,
          },
        };
      } catch {
        return { available: false, capabilities: NO_CAPABILITIES };
      }
    },
    async *stream(input, signal) {
      const response = await open(
        ':streamGenerateContent?alt=sse',
        {
          contents: [{ role: 'user', parts: [{ text: input.content }] }],
          generationConfig: {
            maxOutputTokens: input.maxTokens,
            ...(config.thinkingLevel
              ? { thinkingConfig: { thinkingLevel: config.thinkingLevel } }
              : {}),
          },
        },
        signal,
      );

      for await (const data of decodeServerSentEvents(response)) {
        signal?.throwIfAborted();
        const output = Output.parse(data);

        if (output.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new ProviderInvalidError(
            'Gemini atingiu o limite de tokens antes de completar a resposta.',
          );
        }

        const content =
          output.candidates?.[0]?.content?.parts
            .filter((part) => !part.thought)
            .map((part) => part.text ?? '')
            .join('') ?? '';
        const metadata = output.usageMetadata;
        yield {
          content,
          inputTokens: metadata?.promptTokenCount ?? null,
          outputTokens:
            metadata?.totalTokenCount !== undefined &&
            metadata.promptTokenCount !== undefined
              ? Math.max(
                  0,
                  metadata.totalTokenCount - metadata.promptTokenCount,
                )
              : metadata?.candidatesTokenCount !== undefined
                ? metadata.candidatesTokenCount +
                  (metadata.thoughtsTokenCount ?? 0)
                : null,
        };
      }
    },
    async execute(input, signal) {
      try {
        const output = Output.parse(
          await request(
            ':generateContent',
            {
              contents: [{ role: 'user', parts: [{ text: input.content }] }],
              generationConfig: {
                maxOutputTokens: input.maxTokens,
                ...(config.thinkingLevel
                  ? { thinkingConfig: { thinkingLevel: config.thinkingLevel } }
                  : {}),
              },
            },
            signal,
          ),
        );

        if (output.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new ProviderInvalidError(
            'Gemini atingiu o limite de tokens antes de completar a resposta.',
          );
        }

        const content =
          output.candidates?.[0]?.content?.parts
            .filter((part) => !part.thought)
            .map((part) => part.text ?? '')
            .join('') ?? '';

        if (!content.trim()) {
          throw new ProviderInvalidError('Gemini não retornou texto.');
        }

        return {
          content,
          inputTokens: output.usageMetadata?.promptTokenCount ?? null,
          outputTokens:
            output.usageMetadata?.totalTokenCount !== undefined &&
            output.usageMetadata.promptTokenCount !== undefined
              ? Math.max(
                  0,
                  output.usageMetadata.totalTokenCount -
                    output.usageMetadata.promptTokenCount,
                )
              : output.usageMetadata?.candidatesTokenCount !== undefined
                ? output.usageMetadata.candidatesTokenCount +
                  (output.usageMetadata.thoughtsTokenCount ?? 0)
                : null,
        };
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }

        if (
          error instanceof QuotaExceededError ||
          error instanceof ProviderUnavailableError ||
          error instanceof ProviderTemporarilyUnavailableError ||
          error instanceof ProviderInvalidError
        ) {
          throw error;
        }

        throw new ProviderUnavailableError('Falha na comunicação com Gemini.');
      }
    },
  };
}
