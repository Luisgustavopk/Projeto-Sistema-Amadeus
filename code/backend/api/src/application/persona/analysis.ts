import { z } from 'zod';
import { readFileSync } from 'node:fs';
import {
  JEV_ENDPOINT,
  JEV_MODEL,
  PersonaAnalysisConfigurationSchema,
  type PersonaAnalysisConfiguration,
} from '../../domain/persona/tone.ts';
import {
  ProviderSchema,
  type DataClass,
} from '../../domain/providers/model.ts';
import {
  ProviderBusyError,
  ProviderTemporarilyUnavailableError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';
import type { RevisionRepository } from '../../ports/revision-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type { PersonaDecisionClient } from '../../ports/persona-decision.ts';
import {
  TONE_CRITERIA,
  TONE_INSTRUCTIONS,
  toneDirection,
} from './tone-rubric.ts';

const memoryReviewDocument = readFileSync(
  new URL('./jev-memory-review-v1.md', import.meta.url),
  'utf8',
);

if (memoryReviewDocument.length > 4000) {
  throw new Error('Rubrica de conferência excessiva.');
}

const memoryReviewRubric = z
  .strictObject({
    instructions: z.string().min(1).max(2000),
    criteria: z.record(
      z.enum(['supported', 'unsupported', 'uncertain']),
      z.string().min(1).max(600),
    ),
  })
  .parse(
    JSON.parse(
      memoryReviewDocument.match(/```json\s*([\s\S]*?)```/u)?.[1] ?? '',
    ),
  );

const minimumReviewBudget =
  Buffer.byteLength(
    JSON.stringify({
      state: { question: '', reply: '', memories: '', recentConversation: '' },
      ...memoryReviewRubric,
    }),
    'utf8',
  ) + 256;

const clarityDocument = readFileSync(
  new URL('./jev-clarity-v1.md', import.meta.url),
  'utf8',
);
const clarityRubric = z
  .strictObject({
    instructions: z.string().min(1).max(2000),
    criteria: z.record(
      z.enum(['clear', 'clarify', 'uncertain']),
      z.string().min(1).max(600),
    ),
  })
  .parse(
    JSON.parse(clarityDocument.match(/```json\s*([\s\S]*?)```/u)?.[1] ?? ''),
  );

export const PersonaAnalysisStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  configuration: PersonaAnalysisConfigurationSchema,
});
export const PersonaAnalysisEditSchema = PersonaAnalysisStateSchema;

// Accounting identity only; Jev requests use PersonaDecisionClient, not http-json.
export const personaAnalysisProfile = (config: PersonaAnalysisConfiguration) =>
  ProviderSchema.parse({
    adapter: 'http-json',
    endpoint: JEV_ENDPOINT,
    model: JEV_MODEL,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    dataPolicy: config.dataPolicy,
    policyReviewedAt: config.policyReviewedAt,
    policyReference: config.policyReference,
    limits: {
      requestsPerDay: config.requestsPerDay,
      tokensPerDay: config.tokensPerDay,
      source: 'operator',
    },
  });

export function createPersonaAnalysis(dependencies: {
  repository: RevisionRepository;
  usage: ProviderUsageRepository;
  ownerId: string;
  client: PersonaDecisionClient;
  now?: () => number;
}) {
  const { repository, usage, ownerId, client } = dependencies;
  const now = dependencies.now ?? Date.now;
  const key = `persona-analysis:${ownerId}`;
  let blockedUntil = 0;
  let reviewBlockedUntil = 0;
  const counts = {
    applied: 0,
    uncertain: 0,
    unavailable: 0,
    skipped: 0,
    memorySupported: 0,
    memoryRejected: 0,
    memoryUncertain: 0,
    memoryUnavailable: 0,
  };

  const get = async () => {
    const raw = await repository.read(key);

    return raw
      ? PersonaAnalysisStateSchema.parse(JSON.parse(raw))
      : {
          revision: 0,
          configuration: PersonaAnalysisConfigurationSchema.parse({}),
        };
  };

  return {
    get,
    async reviewMode() {
      return (await get()).configuration.memoryReviewMode;
    },
    async canReviewMemory(dataClass: DataClass) {
      const { configuration: config } = await get();

      if (
        !client.reviewMemory ||
        !config.enabled ||
        dataClass === 'local-only' ||
        (dataClass === 'personal' &&
          config.dataPolicy !== 'personal-approved') ||
        reviewBlockedUntil > now()
      ) {
        return false;
      }

      const used = await usage.usage(
        ownerId,
        'llm',
        personaAnalysisProfile(config),
      );

      return (
        used.requests < config.requestsPerDay &&
        used.budgetTokens + minimumReviewBudget <= config.tokensPerDay
      );
    },
    async configure(input: z.infer<typeof PersonaAnalysisEditSchema>) {
      const edit = PersonaAnalysisEditSchema.parse(input);
      const raw = await repository.read(key);
      const revision = raw
        ? PersonaAnalysisStateSchema.parse(JSON.parse(raw)).revision
        : 0;

      if (edit.revision !== revision) {
        throw new ProviderBusyError(
          'A análise de persona foi alterada; consulte a revisão atual.',
        );
      }

      const next = {
        revision: revision + 1,
        configuration: edit.configuration,
      };

      if (!(await repository.compareAndSave(key, raw, JSON.stringify(next)))) {
        throw new ProviderBusyError(
          'Análise de persona alterada simultaneamente.',
        );
      }

      blockedUntil = 0;
      reviewBlockedUntil = 0;

      return next;
    },
    async describe() {
      const state = await get();

      return {
        ...state,
        model: JEV_MODEL,
        apiKeyEnv: 'OPENROUTER_API_KEY',
        usage: await usage.usage(
          ownerId,
          'llm',
          personaAnalysisProfile(state.configuration),
        ),
        counts: { ...counts },
      };
    },
    async reviewMemory(
      input: {
        memories: string;
        question: string;
        reply: string;
        dataClass: DataClass;
        recentConversation: string;
      },
      signal: AbortSignal,
    ): Promise<boolean | null> {
      signal.throwIfAborted();
      let reservation: string | undefined;
      let settled = false;

      let clearDeadline = () => {};

      try {
        const { configuration: config } = await get();

        if (
          !client.reviewMemory ||
          !config.enabled ||
          input.dataClass === 'local-only' ||
          (input.dataClass === 'personal' &&
            config.dataPolicy !== 'personal-approved') ||
          reviewBlockedUntil > now()
        ) {
          return null;
        }

        const request = {
          state: {
            question: input.question.slice(0, 4000),
            reply: input.reply.slice(0, 6000),
            memories: input.memories.slice(0, 6000),
            recentConversation: input.recentConversation.slice(0, 1800),
          },
          ...memoryReviewRubric,
        };
        signal.throwIfAborted();
        reservation = await usage.reserve(
          ownerId,
          'llm',
          personaAnalysisProfile(config),
          Buffer.byteLength(JSON.stringify(request), 'utf8') + 256,
        );
        const bounded = AbortSignal.any([
          signal,
          AbortSignal.timeout(config.memoryReviewTimeoutMs),
        ]);
        const deadline = new Promise<never>((_resolve, reject) => {
          const cancel = () => reject(bounded.reason);
          bounded.addEventListener('abort', cancel, { once: true });
          clearDeadline = () => bounded.removeEventListener('abort', cancel);
        });
        const result = await Promise.race([
          client.reviewMemory(request, bounded),
          deadline,
        ]);
        signal.throwIfAborted();
        settled = true;
        await usage.settle(reservation, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });

        // A weak classification is not evidence of a factual contradiction.
        // Let the independent semantic reviewer decide; never approve it here.
        if (
          result.verdict === 'uncertain' ||
          result.confidence < config.minimumConfidence
        ) {
          counts.memoryUncertain++;

          return null;
        }

        const supported = result.verdict === 'supported';
        counts[supported ? 'memorySupported' : 'memoryRejected']++;

        return supported;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        reviewBlockedUntil =
          now() + (error instanceof QuotaExceededError ? 60000 : 15000);
        counts.memoryUnavailable++;

        return null;
      } finally {
        clearDeadline();

        if (reservation && !settled) {
          await usage.settle(reservation, null).catch(() => {
            counts.memoryUnavailable++;
          });
        }
      }
    },
    async analyze(
      input: { text: string; recentConversation: string; dataClass: DataClass },
      signal: AbortSignal,
      onClarity?: (needsClarification: boolean) => void,
    ): Promise<string> {
      signal.throwIfAborted();
      let reservation: string | undefined;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });

      try {
        const { configuration: config } = await get();

        if (
          !config.enabled ||
          input.dataClass === 'local-only' ||
          (input.dataClass === 'personal' &&
            config.dataPolicy !== 'personal-approved') ||
          blockedUntil > now()
        ) {
          counts.skipped++;

          return '';
        }

        const request = {
          state: {
            currentUserText: input.text.slice(0, 4000),
            recentConversation: input.recentConversation.slice(0, 1800),
          },
          instructions: TONE_INSTRUCTIONS,
          criteria: TONE_CRITERIA,
          ...(onClarity ? { clarity: clarityRubric } : {}),
        };
        signal.throwIfAborted();
        reservation = await usage.reserve(
          ownerId,
          'llm',
          personaAnalysisProfile(config),
          Buffer.byteLength(JSON.stringify(request), 'utf8') + 256,
        );
        signal.throwIfAborted();
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => {
              controller.abort();
              reject(
                new ProviderTemporarilyUnavailableError(
                  'Prazo de análise atingido.',
                ),
              );
            },
            onClarity ? config.clarityTimeoutMs : config.timeoutMs,
          );
          controller.signal.addEventListener(
            'abort',
            () => reject(controller.signal.reason),
            { once: true },
          );
        });
        const result = await Promise.race([
          client.decide(request, controller.signal),
          deadline,
        ]);
        signal.throwIfAborted();
        settled = true;
        await usage.settle(reservation, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        const clarity = result.clarity;
        onClarity?.(
          Boolean(
            clarity &&
            ((clarity.choice === 'clarify' &&
              clarity.confidence >= Math.max(0.9, config.minimumConfidence)) ||
              // A weak claim of comprehension is not grounds for inventing a term.
              (clarity.choice === 'clear' && clarity.confidence < 0.6)),
          ),
        );
        const direction =
          result.confidence >= config.minimumConfidence
            ? toneDirection(result.tone)
            : '';
        counts[direction ? 'applied' : 'uncertain']++;

        return direction;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        blockedUntil =
          now() + (error instanceof QuotaExceededError ? 60000 : 15000);
        counts.unavailable++;

        return '';
      } finally {
        if (timer) {
          clearTimeout(timer);
        }

        controller.abort();
        signal.removeEventListener('abort', abort);

        if (reservation && !settled) {
          await usage.settle(reservation, null).catch(() => {
            counts.unavailable++;
          });
        }
      }
    },
  };
}

export type PersonaAnalysis = ReturnType<typeof createPersonaAnalysis>;
