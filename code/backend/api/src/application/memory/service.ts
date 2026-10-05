import type { MemoryRepository } from '../../ports/memory-repository.ts';
import type { ProviderServices } from '../providers/index.ts';
import type { MemoryProvider } from './provider.ts';
import {
  FactInputSchema,
  MemoryPolicyEditSchema,
  strongestDataClass,
  type FactInput,
  type MemoryPolicy,
  normalizeMemory,
} from '../../domain/memory/model.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import {
  DataPolicyBlockedError,
  ProviderBusyError,
} from '../../domain/errors/providers.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import {
  MEMORY_EXTRACTION_PROMPT,
  parseMemoryExtraction,
  suggestLocally,
  summarizeSources,
} from './extraction.ts';
import {
  memoryEligible,
  memoryTerms,
  selectRelevantFacts,
} from './retrieval.ts';

export function createMemoryService(
  repository: MemoryRepository,
  providers: Pick<ProviderServices, 'execute'> &
    Partial<Pick<MemoryProvider, 'describeMemory'>>,
  isBusy: () => boolean,
) {
  let running: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let abort: AbortController | undefined;
  let stopped = false;
  let lastPurge = 0;
  let lastForegroundAt = 0;
  const measurements = {
    retrievals: 0,
    totalRetrievalMs: 0,
    lastContextCharacters: 0,
    completedJobs: 0,
    deferredJobs: 0,
  };

  async function prepareMutation() {
    abort?.abort();
    await running;

    if (isBusy()) {
      throw new ProviderBusyError(
        'Aguarde o turno atual antes de alterar a memória.',
      );
    }
  }

  async function requirePersonalPolicy(
    dataClass: DataClass,
    policy?: MemoryPolicy,
  ) {
    const current = policy ?? (await repository.policy());

    if (dataClass !== 'synthetic' && !current.personalEnabled) {
      throw new DataPolicyBlockedError(
        'Ative a memória pessoal após reconhecer armazenamento local e retenção.',
      );
    }

    return current;
  }

  async function processOne(now: number) {
    const policy = await repository.policy();

    if (
      !policy.enabled ||
      stopped ||
      isBusy() ||
      now - lastForegroundAt < 15000
    ) {
      return;
    }

    if (now - lastPurge > 3600000) {
      await repository.purgeExpired(now);
      lastPurge = now;
    }

    await repository.enqueue(undefined, now - 15000);
    const job = await repository.claim(now);

    if (!job) {
      return;
    }

    try {
      const previousSources =
        policy.extraction === 'llm'
          ? await repository.previousSources(job)
          : [];
      const contextSources = [...previousSources, ...job.sources];
      const dataClass = strongestDataClass(
        contextSources.map((source) => source.dataClass),
      );
      await requirePersonalPolicy(dataClass, policy);

      if (isBusy() || now - lastForegroundAt < 15000) {
        await repository.defer(job, 'ACTIVE_CONVERSATION', now + 5000, false);

        return;
      }

      let suggestions = suggestLocally(job.sources);

      if (policy.extraction === 'llm' && job.sources.length) {
        const query = [...job.sources, ...previousSources]
          .map((s) => s.userText)
          .join(' ');
        const candidates = await repository.candidateFacts(
          memoryTerms(query),
          dataClass,
        );
        const selected = selectRelevantFacts(
          candidates,
          query,
          dataClass,
          3000,
        );
        const known = candidates.filter((f) =>
          selected.some((c) => c.id === f.id),
        );
        const wireCurrent = job.sources.map((source) => ({
          ...source,
          userText: source.userText.slice(0, 1500),
          assistantConfirmed: source.assistantConfirmed.slice(0, 200),
        }));
        const wirePrevious = previousSources.map((source) => ({
          ...source,
          userText: source.userText.slice(0, 900),
          assistantConfirmed: source.assistantConfirmed.slice(0, 200),
        }));
        const wire = (source: (typeof wireCurrent)[number]) => ({
          ...source,
          turnId: source.id,
          userTruncated:
            source.userText.length <
            contextSources.find((s) => s.id === source.id)!.userText.length,
          assistantTruncated:
            source.assistantConfirmed.length <
            contextSources.find((s) => s.id === source.id)!.assistantConfirmed
              .length,
        });
        abort = new AbortController();
        const signal = AbortSignal.any([
          abort.signal,
          AbortSignal.timeout(45000),
        ]);
        const output = await providers.execute(
          'llm',
          {
            systemPrompt: MEMORY_EXTRACTION_PROMPT,
            content: JSON.stringify({
              currentSources: wireCurrent.map(wire),
              previousSources: wirePrevious.map(wire),
              existingFacts: known.map((f) => ({
                id: f.id,
                version: f.version,
                text: f.text,
                kind: f.kind,
                expiresAt: f.expiresAt,
                relation: f.relation,
              })),
            }),
            dataClass,
            purpose: 'memory',
            maxTokens: 4096,
          },
          signal,
        );
        suggestions = parseMemoryExtraction(
          output.content,
          [...wirePrevious, ...wireCurrent],
          wireCurrent,
          known,
        );
      }

      const completed = await repository.complete(
        job,
        suggestions,
        summarizeSources(job.sources),
        policy.extraction === 'llm' ? 'llm-extraction' : 'local-extraction',
      );

      if (completed) {
        measurements.completedJobs++;
      }
    } catch (error) {
      const code =
        error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR';
      const quotaOrPolicy = [
        'QUOTA_EXCEEDED',
        'DATA_POLICY_BLOCKED',
        'PROVIDER_DISABLED',
        'PROVIDER_BUSY',
        'PROVIDER_CONFIGURATION',
      ].includes(code);
      const retry =
        error &&
        typeof error === 'object' &&
        'retryAfterMs' in error &&
        typeof error.retryAfterMs === 'number'
          ? Math.max(0, error.retryAfterMs)
          : 0;
      await repository.defer(
        job,
        code,
        now +
          Math.max(
            retry,
            quotaOrPolicy
              ? 60000
              : Math.min(3600000, 15000 * 2 ** job.attempts),
          ),
        !quotaOrPolicy && !abort?.signal.aborted,
      );
      measurements.deferredJobs++;
    } finally {
      abort = undefined;
    }
  }

  const service = {
    prepareForConfiguration: prepareMutation,
    async start() {
      await repository.recover();
      timer = setInterval(() => {
        void service.runOnce().catch(() => undefined);
      }, 5000);
      timer.unref();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      abort?.abort();
      await running;
    },
    interruptBackground() {
      lastForegroundAt = Date.now();
      abort?.abort();
    },
    async runOnce(now = Date.now()) {
      if (!running) {
        running = processOne(now).finally(() => {
          running = undefined;
        });
      }

      await running;
    },
    policy: () => repository.policy(),
    async configure(input: unknown) {
      const parsed = MemoryPolicyEditSchema.parse(input);

      if (
        (parsed.personalEnabled || parsed.retentionDays !== null) &&
        !parsed.acknowledgeLocalStorage
      ) {
        throw new DataPolicyBlockedError(
          'Confirme o armazenamento em SQLite local sem criptografia própria, com retenção configurada.',
        );
      }

      if (parsed.personalEnabled && parsed.retentionDays === null) {
        throw new DataPolicyBlockedError(
          'Escolha a retenção antes de ativar a memória pessoal.',
        );
      }

      await prepareMutation();

      return repository.updatePolicy({
        revision: parsed.expectedRevision,
        enabled: parsed.enabled,
        personalEnabled: parsed.personalEnabled,
        autoApprove:
          parsed.autoApprove ?? (await repository.policy()).autoApprove,
        extraction: parsed.extraction,
        retentionDays: parsed.retentionDays,
      });
    },
    list: () => repository.facts(),
    async consolidate() {
      await prepareMutation();

      return repository.consolidate();
    },
    async graph() {
      const nodes = new Map<string, { id: string; label: string }>();
      const edges = [];

      for (const fact of await repository.facts()) {
        if (
          fact.status !== 'confirmed' ||
          !fact.relation ||
          (fact.expiresAt !== null && fact.expiresAt <= Date.now())
        ) {
          continue;
        }

        const source = normalizeMemory(fact.relation.subject);
        const target = normalizeMemory(fact.relation.object);
        nodes.set(source, { id: source, label: fact.relation.subject });
        nodes.set(target, { id: target, label: fact.relation.object });
        edges.push({
          factId: fact.id,
          source,
          target,
          predicate: fact.relation.predicate,
        });
      }

      return { nodes: [...nodes.values()], edges };
    },
    summaries: () => repository.summaries(),
    async permitSummary(
      id: string,
      version: number,
      permission: 'local-only' | 'eligible',
    ) {
      await prepareMutation();

      return repository.permitSummary(id, version, permission);
    },
    async create(input: FactInput) {
      const parsed = FactInputSchema.parse(input);
      await requirePersonalPolicy(parsed.dataClass);
      await prepareMutation();

      return repository.createFact(parsed);
    },
    async edit(
      id: string,
      version: number,
      input: FactInput & { status: 'suggested' | 'confirmed' },
    ) {
      await requirePersonalPolicy(input.dataClass);
      await prepareMutation();

      return repository.editFact(id, version, input);
    },
    async forget(id: string, version: number, eraseSources: boolean) {
      await prepareMutation();

      return repository.forgetFact(id, version, eraseSources);
    },
    async retrieve(conversationId: string, text: string, dataClass: DataClass) {
      const started = performance.now();
      const policy = await repository.policy();

      if (
        !policy.enabled ||
        (dataClass !== 'synthetic' && !policy.personalEnabled)
      ) {
        return '';
      }

      const facts = selectRelevantFacts(
        await repository.candidateFacts(memoryTerms(text), dataClass),
        text,
        dataClass,
      );
      const terms =
        text
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .toLowerCase()
          .match(/[\p{L}\p{N}]{4,}/gu) ?? [];
      const summaries = (await repository.summaries(conversationId)).filter(
        (summary) =>
          memoryEligible(summary, dataClass) &&
          terms.some((term) =>
            summary.content
              .normalize('NFD')
              .replace(/\p{M}/gu, '')
              .toLowerCase()
              .includes(term),
          ),
      );
      // Summaries are local-only by default; no automatic cloud permission.
      const selectedSummaries: { id: string; content: string }[] = [];

      for (const summary of summaries) {
        const rows = JSON.parse(summary.content) as Record<string, unknown>[];
        const entry = {
          id: summary.id,
          content: JSON.stringify(
            rows
              .filter((row) =>
                terms.some((term) =>
                  JSON.stringify(row)
                    .normalize('NFD')
                    .replace(/\p{M}/gu, '')
                    .toLowerCase()
                    .includes(term),
                ),
              )
              .slice(0, 2),
          ),
        };

        if (JSON.stringify([...selectedSummaries, entry]).length <= 1200) {
          selectedSummaries.push(entry);
        }
      }

      const content =
        facts.length || selectedSummaries.length
          ? JSON.stringify({ facts, summaries: selectedSummaries })
          : '';
      measurements.retrievals++;
      measurements.totalRetrievalMs += performance.now() - started;
      measurements.lastContextCharacters = content.length;

      return content;
    },
    async rebuild(conversationId: string) {
      await prepareMutation();
      await repository.rebuild(conversationId);

      return { queued: true };
    },
    async deleteConversation(id: string) {
      await prepareMutation();
      await repository.deleteConversation(id);

      return { deleted: true };
    },
    conversations: () => repository.listConversations(),
    conversation: (id: string) => repository.conversation(id),
    export: () => repository.exportData(),
    async status() {
      return {
        policy: await repository.policy(),
        jobs: await repository.jobs(),
        measurements: { ...measurements },
        ...(providers.describeMemory
          ? { extractor: await providers.describeMemory() }
          : {}),
      };
    },
  };

  return service;
}

export type MemoryService = ReturnType<typeof createMemoryService>;
