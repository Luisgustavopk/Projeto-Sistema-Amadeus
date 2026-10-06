import type { MemoryRepository } from '../../ports/memory-repository.ts';
import type { ProviderServices } from '../providers/index.ts';
import type { MemoryProvider } from './provider.ts';
import type { MemoryEmbeddings } from '../../ports/memory-embeddings.ts';
import type { MemoryReranker } from '../../ports/memory-reranker.ts';
import {
  MEMORY_CONTEXT_CHARACTERS,
  validRelevance,
} from '../../domain/memory/ranking.ts';
import { createSemanticMemorySearch } from './semantic-search.ts';
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
  extractionFactContext,
  parseMemoryExtraction,
  suggestLocally,
  summarizeSources,
} from './extraction.ts';
import {
  memoryEligible,
  memoryContextSources,
  memoryTerms,
  selectRelevantFacts,
} from './retrieval.ts';

export function createMemoryService(
  repository: MemoryRepository,
  providers: Pick<ProviderServices, 'execute'> &
    Partial<Pick<MemoryProvider, 'describeMemory'>>,
  isBusy: () => boolean,
  embeddings?: MemoryEmbeddings,
  reranker?: MemoryReranker,
) {
  const semantic = createSemanticMemorySearch(repository, embeddings);
  let rankingRetryAt = 0;
  const ranking: {
    enabled: boolean;
    model: string | null;
    state: 'disabled' | 'idle' | 'ready' | 'degraded';
    lastError: string | null;
  } = {
    enabled: Boolean(reranker),
    model: reranker?.key ?? null,
    state: reranker ? 'idle' : 'disabled',
    lastError: null,
  };
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

  async function relevantFacts(
    queries: string[],
    dataClass: DataClass,
    budget = MEMORY_CONTEXT_CHARACTERS,
  ) {
    const semanticResults = await semantic.search(queries, dataClass);
    const query = queries.join(' ');
    let candidates = await repository.candidateFacts(
      memoryTerms(query),
      dataClass,
      [...semanticResults.keys()],
    );
    const scores = new Map(
      candidates.flatMap((fact) => {
        const result = semanticResults.get(fact.id);

        return result?.version === fact.version
          ? [[fact.id, result.score] as const]
          : [];
      }),
    );

    if (reranker && candidates.length && Date.now() >= rankingRetryAt) {
      try {
        const pool = candidates
          .filter((fact) => scores.has(fact.id))
          .sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
          .slice(0, 24);

        if (pool.length) {
          const values = await reranker.rank(
            queries.at(-1)!,
            pool.map((fact) => fact.text),
          );

          if (values.length !== pool.length || !values.every(validRelevance)) {
            throw new Error('Ranking inválido.');
          }

          // Relevance is not a calibrated truth probability. A very strong
          // generic match must not suppress a weaker complementary detail.
          const cutoff = 0.05;
          const accepted = new Map(
            pool.flatMap((fact, index) =>
              values[index]! >= cutoff
                ? [
                    [
                      fact.id,
                      { score: values[index]!, version: fact.version },
                    ] as const,
                  ]
                : [],
            ),
          );
          // Recheck versions after inference; a concurrent correction/deletion
          // must not inject the old fact or reuse its relevance for a new one.
          candidates = await repository.candidateFacts([], dataClass, [
            ...accepted.keys(),
          ]);
          scores.clear();

          for (const fact of candidates) {
            const result = accepted.get(fact.id);

            if (result?.version === fact.version) {
              scores.set(fact.id, result.score);
            }
          }

          ranking.state = 'ready';
          ranking.lastError = null;
        }
      } catch {
        ranking.state = 'degraded';
        ranking.lastError = 'LOCAL_RERANKER_UNAVAILABLE';
        rankingRetryAt = Date.now() + 60000;
      }
    }

    return {
      candidates,
      selected: selectRelevantFacts(
        candidates,
        query,
        dataClass,
        budget,
        scores,
        semantic.status().state === 'ready',
      ),
    };
  }

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

    await semantic.index(
      policy.personalEnabled ? 'local-only' : 'synthetic',
      () => !stopped && !isBusy() && Date.now() - lastForegroundAt >= 15000,
    );

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
        abort = new AbortController();
        const signal = AbortSignal.any([
          abort.signal,
          AbortSignal.timeout(45000),
        ]);
        const { candidates, selected } = await relevantFacts(
          contextSources.map((source) => source.userText),
          dataClass,
          3000,
        );
        signal.throwIfAborted();
        const { known, wire: existingFacts } = extractionFactContext(
          candidates,
          selected.map((fact) => fact.id),
          job.sources,
          dataClass,
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
          turnId: source.id,
          createdAt: source.createdAt,
          userText: source.userText,
          assistantConfirmed: source.assistantConfirmed,
          userTruncated:
            source.userText.length <
            contextSources.find((s) => s.id === source.id)!.userText.length,
          assistantTruncated:
            source.assistantConfirmed.length <
            contextSources.find((s) => s.id === source.id)!.assistantConfirmed
              .length,
        });
        const output = await providers.execute(
          'llm',
          {
            systemPrompt: MEMORY_EXTRACTION_PROMPT,
            content: JSON.stringify({
              currentSources: wireCurrent.map(wire),
              previousSources: wirePrevious.map(wire),
              existingFacts,
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
      const code = abort?.signal.aborted
        ? 'ACTIVE_CONVERSATION'
        : error instanceof ApplicationError
          ? error.code
          : 'INTERNAL_ERROR';
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
      await semantic.close();
      await reranker?.close();
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
    async rejectInterpretation(id: string, version: number) {
      await prepareMutation();

      return repository.rejectInterpretation(id, version);
    },
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
    async retrieve(
      conversationId: string,
      text: string,
      dataClass: DataClass,
      recentContext: { user: string; assistantConfirmed: string }[] = [],
    ) {
      const started = performance.now();
      const policy = await repository.policy();

      if (
        !policy.enabled ||
        (dataClass !== 'synthetic' && !policy.personalEnabled)
      ) {
        return '';
      }

      const previous = recentContext
        .filter((turn) => turn.user.trim() !== text.trim())
        .slice(-2)
        .map((turn) =>
          [turn.user.slice(0, 400), turn.assistantConfirmed.slice(0, 400)]
            .filter(Boolean)
            .join('\n'),
        );
      const queries = previous.length
        ? [text, [...previous, text].join('\n')]
        : [text];
      const { selected: facts, candidates } = await relevantFacts(
        queries,
        dataClass,
      );
      const sources = new Map<string, number[]>();

      for (const [index, fact] of facts.entries()) {
        const stored = candidates.find((candidate) => candidate.id === fact.id);

        for (const source of stored ? memoryContextSources(stored) : []) {
          const key = source.conversationId + ':' + source.turnId;
          const group = sources.get(key) ?? [];

          if (!group.includes(index)) {
            group.push(index);
          }

          sources.set(key, group);
        }
      }

      // Indices refer only to selected, permitted facts. No source text or
      // hidden facts are disclosed. Co-mention does not assert a graph edge.
      const coMentioned: number[][] = [];
      const seenGroups = new Set<string>();

      for (const group of sources.values()) {
        const key = JSON.stringify(group);

        if (group.length < 2 || seenGroups.has(key)) {
          continue;
        }

        if (
          JSON.stringify({ facts, coMentioned: [...coMentioned, group] })
            .length > MEMORY_CONTEXT_CHARACTERS
        ) {
          continue;
        }

        coMentioned.push(group);
        seenGroups.add(key);

        if (coMentioned.length === 8) {
          break;
        }
      }

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
          ? JSON.stringify({
              facts,
              summaries: selectedSummaries,
              ...(coMentioned.length ? { coMentioned } : {}),
            })
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
        search: semantic.status(),
        ranking: { ...ranking },
        ...(providers.describeMemory
          ? { extractor: await providers.describeMemory() }
          : {}),
      };
    },
  };

  return service;
}

export type MemoryService = ReturnType<typeof createMemoryService>;
