import { z } from 'zod';
import type { PersonaDecisionClient } from '../../ports/persona-decision.ts';
import {
  ToneSchema,
  JEV_ENDPOINT,
  JEV_MODEL,
} from '../../domain/persona/tone.ts';
import {
  ProviderConfigurationError,
  ProviderInvalidError,
  ProviderTemporarilyUnavailableError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';

const ResponseSchema = z.object({
  model: z.string().regex(/^typesafe\/jev-1\.13(?:-\d{8})?$/u),
  answers: z.record(
    z.string(),
    z.object({
      type: z.literal('choice'),
      choice: z.string().min(1).max(32),
      confidence: z.number().min(0).max(1),
      probabilities: z.record(z.string(), z.number().min(0).max(1)),
    }),
  ),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cost: z.number().nonnegative().finite(),
  }),
});

export function createJevClient(
  secrets: NodeJS.ProcessEnv,
): PersonaDecisionClient {
  async function request(
    input: {
      state: object;
      instructions: string;
      criteria: Record<string, string>;
      clarity?: { instructions: string; criteria: Record<string, string> };
    },
    signal: AbortSignal,
    question: string,
  ) {
    const key = secrets.OPENROUTER_API_KEY;

    if (!key) {
      throw new ProviderConfigurationError(
        'Configure OPENROUTER_API_KEY para Jev.',
      );
    }

    let response: Response;

    try {
      response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: JEV_MODEL,
          state: input.state,
          questions: {
            ...(input.clarity
              ? { clarity: { type: 'choice', ...input.clarity } }
              : {}),
            [question]: {
              type: 'choice',
              instructions: input.instructions,
              criteria: input.criteria,
            },
          },
          provider: {
            data_collection: 'deny',
            max_price: { prompt: 0.042, completion: 0, request: 0 },
          },
        }),
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      throw new ProviderTemporarilyUnavailableError(
        'Jev indisponível na rede.',
      );
    }

    if (!response.ok) {
      await response.body?.cancel();

      if ([402, 429].includes(response.status)) {
        throw new QuotaExceededError('Crédito ou cota de Jev indisponível.');
      }

      if ([401, 403].includes(response.status)) {
        throw new ProviderConfigurationError(
          'Credencial ou permissão de Jev recusada.',
        );
      }

      throw new ProviderTemporarilyUnavailableError(
        'Jev temporariamente indisponível.',
      );
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new ProviderInvalidError('Jev não retornou dados.');
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

        if (bytes > 32768) {
          throw new ProviderInvalidError('Resposta Jev excessiva.');
        }

        chunks.push(next.value);
      }

      const parsed = ResponseSchema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );

      if (!parsed.success) {
        throw new ProviderInvalidError('Decisão Jev inválida.');
      }

      const tone = parsed.data.answers[question];

      if (
        !tone ||
        !Object.hasOwn(input.criteria, tone.choice) ||
        Object.keys(tone.probabilities).sort().join(',') !==
          Object.keys(input.criteria).sort().join(',')
      ) {
        throw new ProviderInvalidError(
          'Escolhas Jev incompatíveis com a rubrica.',
        );
      }

      const probabilities = Object.values(tone.probabilities);

      if (
        Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) > 0.02 ||
        tone.probabilities[tone.choice]! < Math.max(...probabilities)
      ) {
        throw new ProviderInvalidError('Probabilidades Jev incoerentes.');
      }

      let clarity:
        | { choice: 'clear' | 'clarify' | 'uncertain'; confidence: number }
        | undefined;

      if (input.clarity) {
        const value = parsed.data.answers.clarity;
        const criteria = input.clarity.criteria;
        const probabilities = value ? Object.values(value.probabilities) : [];

        if (
          !value ||
          !Object.hasOwn(criteria, value.choice) ||
          Object.keys(value.probabilities).sort().join(',') !==
            Object.keys(criteria).sort().join(',') ||
          Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) > 0.02 ||
          value.probabilities[value.choice]! < Math.max(...probabilities)
        ) {
          throw new ProviderInvalidError('Decisão de clareza Jev inválida.');
        }

        clarity = {
          choice: z.enum(['clear', 'clarify', 'uncertain']).parse(value.choice),
          confidence: Math.min(
            value.confidence,
            value.probabilities[value.choice]!,
          ),
        };
      }

      return {
        choice: tone.choice,
        confidence: Math.min(tone.confidence, tone.probabilities[tone.choice]!),
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens,
        costUsd: parsed.data.usage.cost,
        ...(clarity ? { clarity } : {}),
      };
    } catch (error) {
      if (signal.aborted || error instanceof ProviderInvalidError) {
        throw error;
      }

      throw new ProviderInvalidError('Resposta Jev inválida.');
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  return {
    async decide(input, signal) {
      const { choice, ...result } = await request(input, signal, 'tone');

      return { ...result, tone: ToneSchema.parse(choice) };
    },
    async reviewMemory(input, signal) {
      const { choice, ...result } = await request(input, signal, 'grounding');

      return {
        ...result,
        verdict: z
          .enum(['supported', 'unsupported', 'uncertain'])
          .parse(choice),
      };
    },
  };
}
