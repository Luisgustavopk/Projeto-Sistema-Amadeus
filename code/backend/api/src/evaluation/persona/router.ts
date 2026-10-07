import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import type { createEvaluationBudget } from './budget.ts';

// Evaluation-only ceilings; they never modify the production paid-model allowlist.
export const evaluationModels = {
  llama: {
    id: 'meta-llama/llama-3.3-70b-instruct',
    family: 'meta',
    prompt: 0.3,
    completion: 0.7,
  },
  gemini: {
    id: 'google/gemini-2.5-flash-lite',
    family: 'google',
    prompt: 0.15,
    completion: 0.6,
  },
  qwen: {
    id: 'qwen/qwen3-235b-a22b-2507',
    family: 'qwen',
    prompt: 0.15,
    completion: 0.9,
  },
  kimi: {
    id: 'moonshotai/kimi-k2.5',
    family: 'moonshot',
    prompt: 0.7,
    completion: 3.3,
  },
} as const;
type Model = (typeof evaluationModels)[keyof typeof evaluationModels];
type Message = { role: string; content: string };
type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};
export type CallRecord = {
  id: string;
  model: string;
  purpose: string;
  request: Record<string, unknown>;
  reservedUsd: number;
  status: 'pending' | 'completed' | 'failed';
  provider?: string;
  returnedModel?: string;
  usage?: Usage;
  firstTokenMs?: number;
  elapsedMs?: number;
  finishReason?: string;
  error?: string;
};

export function createEvaluationRouter(options: {
  key: string;
  budget: ReturnType<typeof createEvaluationBudget>;
  calls: CallRecord[];
  persist: () => Promise<void>;
  fetcher?: typeof fetch;
}) {
  const fetcher = options.fetcher ?? fetch;

  async function* stream(
    model: Model,
    messages: Message[],
    maxTokens: number,
    purpose: string,
    signal: AbortSignal,
    sampling: Record<string, number> = { temperature: 0.6 },
    json = false,
  ) {
    const request = {
      model: model.id,
      messages,
      max_tokens: maxTokens,
      ...sampling,
      stream: true,
      stream_options: { include_usage: true },
      provider: {
        max_price: {
          prompt: model.prompt,
          completion: model.completion,
          request: 0,
        },
        data_collection: 'deny',
        sort: 'latency',
        require_parameters: true,
      },
      ...(model.id === evaluationModels.kimi.id
        ? { reasoning: { enabled: false } }
        : {}),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    };
    const id = randomUUID();
    const reservedUsd = options.budget.reserve(id, messages, maxTokens, model);
    const record: CallRecord = {
      id,
      model: model.id,
      purpose,
      request,
      reservedUsd,
      status: 'pending',
    };
    options.calls.push(record);
    await options.persist(); // Durable reservation precedes every paid request.
    const started = performance.now();
    let settled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await fetcher(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
          signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`EVALUATION_HTTP_${response.status}`);
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '',
        doneMarker = false;

      while (true) {
        const item = await reader.read();
        buffer += item.done
          ? decoder.decode()
          : decoder.decode(item.value, { stream: true });
        let boundary;

        while (
          (boundary = buffer.indexOf('\n')) >= 0 ||
          (item.done && buffer.length)
        ) {
          if (boundary < 0) {
            boundary = buffer.length;
          }

          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);

          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();

          if (data === '[DONE]') {
            doneMarker = true;
            continue;
          }

          const chunk = JSON.parse(data) as {
            error?: unknown;
            provider?: string;
            model?: string;
            usage?: Usage;
            choices?: {
              delta?: { content?: string };
              finish_reason?: string | null;
            }[];
          };

          if (chunk.error) {
            throw new Error('EVALUATION_STREAM_ERROR');
          }

          if (chunk.provider) {
            record.provider = chunk.provider;
          }

          if (chunk.model) {
            record.returnedModel = chunk.model;
          }

          if (chunk.usage) {
            record.usage = chunk.usage;
          }

          const choice = chunk.choices?.[0];

          if (choice?.finish_reason) {
            record.finishReason = choice.finish_reason;
          }

          if (choice?.delta?.content) {
            record.firstTokenMs ??= performance.now() - started;
            yield {
              content: choice.delta.content,
              inputTokens: null,
              outputTokens: null,
            };
          }
        }

        if (item.done) {
          break;
        }
      }

      // Reconcile even a truncated completion: failed calls can still cost money.
      settled = true;
      options.budget.settle(id, record.usage?.cost);

      if (record.returnedModel && record.returnedModel !== model.id) {
        throw new Error('EVALUATION_MODEL_MISMATCH');
      }

      if (!doneMarker || record.finishReason !== 'stop') {
        throw new ProviderInvalidError('Resposta de avaliação incompleta.');
      }

      record.status = 'completed';

      if (record.usage) {
        yield {
          content: '',
          inputTokens: record.usage.prompt_tokens ?? null,
          outputTokens: record.usage.completion_tokens ?? null,
          cache: {
            readTokens:
              record.usage.prompt_tokens_details?.cached_tokens ?? null,
            writeTokens: null,
            costUsd: record.usage.cost ?? null,
          },
        };
      }
    } catch (error) {
      record.status = 'failed';
      record.error =
        error instanceof ProviderInvalidError
          ? error.code
          : error instanceof Error &&
              /^EVALUATION_[A-Z_0-9]+$/u.test(error.message)
            ? error.message
            : 'EVALUATION_CALL_FAILED';

      throw error;
    } finally {
      if (record.status === 'pending') {
        record.status = 'failed';
        record.error = 'EVALUATION_STREAM_CLOSED';
      }

      if (!settled) {
        options.budget.settle(id, null);
      } // Never refund an uncertain charge.

      record.elapsedMs = performance.now() - started;
      await reader?.cancel().catch(() => {});
      await options.persist();
    }
  }

  return { stream };
}
