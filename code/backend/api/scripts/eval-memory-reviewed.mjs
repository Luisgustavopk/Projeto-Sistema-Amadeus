import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { createMemoryRepository } from '../src/adapters/database/memory-repository.ts';
import { SqliteConversationRepository } from '../src/adapters/database/conversation-repository.ts';
import { createSqliteCallHistory } from '../src/adapters/database/call-history-repository.ts';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createMemoryProvider } from '../src/application/memory/provider.ts';
import { createMemoryService } from '../src/application/memory/service.ts';
import { createProviderServices } from '../src/application/providers/index.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import { createLocalMemoryReranker } from '../src/adapters/embeddings/reranker.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { createPersonaConfiguration } from '../src/application/persona/configuration.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';

const Dataset = z.strictObject({
  dataClass: z.enum(['synthetic', 'personal']),
  conversations: z
    .array(
      z.strictObject({
        label: z.string(),
        turns: z.array(z.string().min(1).max(4000)).min(1).max(6),
      }),
    )
    .max(12),
  probes: z
    .array(
      z.strictObject({ id: z.string(), question: z.string().min(1).max(4000) }),
    )
    .max(60),
});
const synthetic = Dataset.parse({
  dataClass: 'synthetic',
  conversations: [
    {
      label: 'literatura',
      turns: [
        'Leio vários gêneros, mas, quando é ficção científica, gosto principalmente de Ursula K. Le Guin.',
        'Também gosto de Octavia Butler e Ted Chiang. Não estou colocando os autores em ordem nem escolhendo um favorito absoluto.',
      ],
    },
    {
      label: 'idioma-e-tempo',
      turns: [
        'My side project is called Lighthouse. I use PostgreSQL in it, but not in my other project, Harbor.',
        'I am seeking my first internship. Next year I plan to study at night; currently I attend morning classes.',
      ],
    },
    {
      label: 'correcao-e-ficcao',
      turns: [
        'Antes eu preferia chá preto, agora prefiro chá verde. Meu gato se chama Íris.',
        'Se eu fosse um astronauta numa história, moraria em Marte. Isso é ficção, não um plano meu.',
      ],
    },
  ],
  probes: [
    {
      id: 'Q01',
      question:
        'Qual escritora eu destaquei quando falei de ficção científica?',
    },
    { id: 'Q02', question: 'Qual autor é meu favorito absoluto?' },
    { id: 'Q03', question: 'What database does my Lighthouse project use?' },
    { id: 'Q04', question: 'Do I already study at night?' },
    { id: 'Q05', question: 'Em qual empresa foi meu primeiro estágio?' },
    { id: 'Q06', question: 'Qual chá eu prefiro agora?' },
    { id: 'Q07', question: 'Como se chama meu gato?' },
    { id: 'Q08', question: 'Você lembra em qual planeta eu pretendo morar?' },
    { id: 'Q09', question: 'Which authors did I mention?' },
  ],
});

const arg = (flag) =>
  process.argv.find((a) => a.startsWith(flag + '='))?.slice(flag.length + 1);
if (!process.argv.includes('--run')) {
  console.log(
    JSON.stringify({
      instruction:
        'Use --run. Fatos isolados; cotas reais de produção. Não altera limites sem --temporary-budget-approved.',
      syntheticTurns: 6,
      probes: 9,
    }),
  );
} else await run();

async function run() {
  const config = loadConfig();
  const datasetPath = arg('--dataset');
  const privateDirectory = resolve('data/personal-evals');
  let dataset = synthetic;
  if (datasetPath) {
    const path = resolve(datasetPath),
      scope = relative(privateDirectory, path);
    if (!scope || scope.startsWith('..') || isAbsolute(scope))
      throw new Error('O roteiro deve estar em data/personal-evals/.');
    dataset = Dataset.parse(JSON.parse(await readFile(path, 'utf8')));
    if (
      dataset.dataClass === 'personal' &&
      !process.argv.includes('--personal-approved')
    )
      throw new Error(
        'Confirme a autorização do roteiro com --personal-approved.',
      );
  }
  const directory =
    dataset.dataClass === 'personal'
      ? privateDirectory
      : resolve('data/memory-evals');
  await mkdir(directory, { recursive: true });
  const resumePath = arg('--resume');
  let prior;
  if (resumePath) {
    const path = resolve(resumePath),
      scope = relative(directory, path);
    if (!scope || scope.startsWith('..') || isAbsolute(scope))
      throw new Error('Checkpoint fora do diretório de avaliação.');
    prior = JSON.parse(await readFile(path, 'utf8'));
    const dbScope = relative(directory, resolve(prior.database));
    if (
      !dbScope ||
      dbScope.startsWith('..') ||
      isAbsolute(dbScope) ||
      prior.dataClass !== dataset.dataClass
    )
      throw new Error('Checkpoint incompatível.');
  }
  const base = resumePath
    ? resolve(resumePath).slice(0, -5)
    : resolve(
        directory,
        'reviewed-' + new Date().toISOString().replace(/[:.]/g, '-'),
      );
  const report = prior
    ? {
        ...prior,
        resumedAt: new Date().toISOString(),
        priorErrors: [...(prior.priorErrors ?? []), prior.error],
        error: null,
      }
    : {
        startedAt: new Date().toISOString(),
        scope:
          'Extração revisada, recuperação e pipeline textual real em SQLite isolado. Sem STT/TTS, reprodução ou ACK simulado. Notas semânticas exigem revisão humana.',
        dataClass: dataset.dataClass,
        database: base + '.db',
        executions: [],
        jobs: [],
        probes: [],
        error: null,
      };
  const save = () =>
    writeFile(base + '.json', JSON.stringify(report, null, 2) + '\n');
  const production = await openDatabase(config.DATABASE_URL);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (
      !response.ok &&
      ['api.groq.com', 'openrouter.ai'].includes(
        new URL(String(args[0])).hostname,
      )
    ) {
      let error;
      try {
        error = (await response.clone().json()).error;
      } catch {
        error = null;
      }
      (report.httpFailures ??= []).push({
        status: response.status,
        code: error?.code,
        message: error?.message,
      });
      await save();
    }
    return response;
  };
  let isolated,
    memory,
    original,
    extractor,
    temporary = false;
  let nextMemoryAt = 0,
    nextMainAt = 0;
  try {
    const revisions = createRevisionRepository(production.client);
    const configuration = new SqliteProviderConfigurationRepository(
      production.client,
    );
    const usage = new SqliteProviderUsageRepository(production.client);
    const gate = new ActivityGate(1);
    const realFactory = createProviderFactory(process.env);
    const factory = (role, providerConfig) => {
      const real = realFactory(role, providerConfig);
      // Buffered execution also exercises the normal streaming facade. This
      // avoids pretending that textual completion acknowledges played audio.
      return {
        ...real,
        nativeStreaming: false,
        stream: undefined,
        async execute(input, signal) {
          const isMemory = input.purpose === 'memory';
          const wait =
            input.memoryTask === 'verify-answer'
              ? 0
              : Math.max(
                  0,
                  (isMemory ? nextMemoryAt : nextMainAt) - Date.now(),
                );
          if (wait) await delay(wait, undefined, { signal });
          const event = {
            model: providerConfig.model,
            purpose: input.purpose ?? 'conversation',
            task: input.memoryTask ?? null,
            startedAt: Date.now(),
            succeeded: false,
          };
          report.executions.push(event);
          await save();
          try {
            const result = await real.execute(input, signal);
            event.succeeded = true;
            event.inputTokens = result.inputTokens;
            event.outputTokens = result.outputTokens;
            event.output = result.content;
            const spacing = Math.min(
              50000,
              Math.max(
                12000,
                (((result.inputTokens ?? 2000) + (result.outputTokens ?? 500)) *
                  60000) /
                  6500,
              ),
            );
            if (isMemory)
              nextMemoryAt = Math.max(Date.now(), nextMemoryAt) + spacing;
            else nextMainAt = Date.now() + spacing;
            return result;
          } catch (error) {
            event.error = {
              code: error.code ?? error.name,
              message: error.message,
            };
            throw error;
          } finally {
            await save();
          }
        },
      };
    };
    extractor = createMemoryProvider({
      revisions,
      conversationConfiguration: configuration,
      usage,
      ownerId: config.OWNER_ID,
      factory,
      gate,
    });
    original = await extractor.get();
    if (!original.freeOnly || original.provider.adapter !== 'groq')
      throw new Error(
        'Avaliação exige o extrator gratuito separado da Groq já configurado.',
      );
    report.originalLimits = original.provider.limits;
    report.initialUsage = (await extractor.describeMemory()).usage;
    if (process.argv.includes('--temporary-budget-approved')) {
      await extractor.configure({
        expectedRevision: original.revision,
        freeOnly: true,
        provider: {
          ...original.provider,
          limits: {
            ...original.provider.limits,
            requestsPerDay: 100,
            tokensPerDay: 400000,
          },
        },
      });
      temporary = true;
    }
    const mainConfiguration = {
      async get(owner) {
        const current = await configuration.get(owner);
        const free = (p) =>
          p.adapter === 'groq' ||
          (p.adapter === 'openrouter' && p.model?.endsWith(':free'));
        if (!free(current.llm))
          throw new Error('Principal não está na seleção gratuita aprovada.');
        return {
          ...current,
          llm: {
            ...current.llm,
            fallbackModel: undefined,
            localProvider: undefined,
            fallbackProviders: current.llm.fallbackProviders?.filter(free),
          },
        };
      },
      save: configuration.save.bind(configuration),
    };
    const main = createProviderServices({
      configuration: mainConfiguration,
      usage,
      ownerId: config.OWNER_ID,
      factory,
      gate,
    });
    isolated = await openDatabase(pathToFileURL(base + '.db').href);
    const repo = createMemoryRepository(isolated.client, config.OWNER_ID);
    const history = createSqliteCallHistory(isolated.client);
    const conversations = new SqliteConversationRepository(isolated.client);
    const createMemory = () =>
      createMemoryService(
        repo,
        extractor,
        () => false,
        createLocalMemoryEmbeddings(config.MEMORY_MODEL_CACHE_DIRECTORY),
        createLocalMemoryReranker(config.MEMORY_MODEL_CACHE_DIRECTORY),
      );
    memory = createMemory();
    if (!prior)
      await memory.configure({
        expectedRevision: 0,
        enabled: true,
        personalEnabled: dataset.dataClass === 'personal',
        extraction: 'llm',
        autoApprove: true,
        retentionDays: 30,
        acknowledgeLocalStorage: true,
      });
    async function open(label) {
      const conversation = await conversations.create(config.OWNER_ID),
        sessionId = randomUUID();
      await history.startSession({
        id: sessionId,
        conversationId: conversation.id,
        ownerId: config.OWNER_ID,
        voiceProfileId: null,
      });
      return { label, conversationId: conversation.id, sessionId };
    }
    for (const item of dataset.conversations) {
      const existing = await repo.listConversations();
      let alreadyTaught = false;
      for (const conversation of existing) {
        const source = await repo.conversation(conversation.id);
        if (
          item.turns.every((text) =>
            source.turns.some((turn) => turn.userText === text),
          )
        )
          alreadyTaught = true;
      }
      if (alreadyTaught) continue;
      const session = await open(item.label);
      for (const [index, text] of item.turns.entries()) {
        const responseId = randomUUID();
        await history.beginTurn({
          id: randomUUID(),
          responseId,
          sessionId: session.sessionId,
          conversationId: session.conversationId,
          clientTurnId: index + 1,
          dataClass: dataset.dataClass,
        });
        await history.updateTurn(responseId, {
          userText: text,
          status: 'completed',
        });
      }
      await history.endSession(session.sessionId, 'closed');
      await memory.rebuild(session.conversationId);
    }
    report.teachingComplete = true;
    for (
      let i = 0;
      i < 36 && (await repo.jobs()).some((j) => j.status === 'pending');
      i++
    ) {
      const jobs = await repo.jobs();
      const next = Math.min(
        ...jobs.filter((j) => j.status === 'pending').map((j) => j.nextRun),
      );
      const wait = Math.max(0, Math.max(next, nextMemoryAt) - Date.now());
      if (wait > 60000) throw new Error('Checkpoint waiting for quota/retry.');
      if (wait) await delay(wait);
      await memory.runOnce(Date.now());
      report.jobs = await repo.jobs();
      report.facts = await repo.facts();
      await save();
      if (report.jobs.some((j) => j.status === 'pending' && j.lastError))
        throw new Error(
          'Extraction pending: ' +
            report.jobs.find((j) => j.status === 'pending' && j.lastError)
              ?.lastError,
        );
    }
    if ((await repo.jobs()).some((j) => j.status !== 'completed'))
      throw new Error('Incomplete extraction.');
    report.extractionComplete = true;
    await memory.stop();
    memory = createMemory();
    report.restartedService = true;
    const persona = createPersonaConfiguration(revisions, config.OWNER_ID);
    const processor = createTurnProcessor(
      main,
      history,
      createVoiceMetrics(),
      persona,
      memory,
    );
    const probeLimit = Number(arg('--limit') ?? dataset.probes.length);
    for (const probe of dataset.probes
      .filter(
        (probe) =>
          !report.probes.some(
            (p) => p.id === probe.id && p.status === 'completed',
          ),
      )
      .slice(0, probeLimit)) {
      const wait = Math.max(0, Math.max(nextMemoryAt, nextMainAt) - Date.now());
      if (wait) await delay(wait);
      const session = await open(probe.id),
        responseId = randomUUID();
      await history.beginTurn({
        id: randomUUID(),
        responseId,
        sessionId: session.sessionId,
        conversationId: session.conversationId,
        clientTurnId: 1,
        dataClass: dataset.dataClass,
      });
      const record = { ...probe, events: [], status: 'pending' };
      report.probes.push(record);
      record.retrieved = await memory.retrieve(
        session.conversationId,
        probe.question,
        dataset.dataClass,
      );
      try {
        await processor.process(
          {
            ...session,
            ownerId: config.OWNER_ID,
            turnId: 1,
            responseId,
            text: probe.question,
            dataClass: dataset.dataClass,
            profile: null,
            signal: AbortSignal.timeout(90000),
            speechEndedAt: performance.now(),
          },
          {
            send: (e) => record.events.push(e),
            audio: async () => {
              throw new Error('Áudio não faz parte desta avaliação.');
            },
          },
        );
        record.reply = record.events
          .filter((e) => e.type === 'reply.text')
          .map((e) => e.text)
          .join('');
        record.status = 'completed';
      } catch (error) {
        record.status = 'failed';
        record.error = {
          code: error.code ?? error.name,
          message: error.message,
        };
      }
      await history.endSession(session.sessionId, 'closed');
      await save();
      console.log(
        JSON.stringify({
          probe: probe.id,
          status: record.status,
          error: record.error?.code,
        }),
      );
      if (
        ['QUOTA_EXCEEDED', 'PROVIDER_TEMPORARILY_UNAVAILABLE'].includes(
          record.error?.code,
        )
      )
        break;
    }
  } catch (error) {
    report.error = { code: error.code ?? error.name, message: error.message };
    process.exitCode = 1;
  } finally {
    await memory?.stop();
    isolated?.client.close();
    if (temporary) {
      const current = await extractor.get();
      report.restoredLimits = (
        await extractor.configure({
          expectedRevision: current.revision,
          freeOnly: true,
          provider: { ...current.provider, limits: original.provider.limits },
        })
      ).provider.limits;
    }
    report.finishedAt = new Date().toISOString();
    await save();
    globalThis.fetch = originalFetch;
    production.client.close();
    console.log(
      JSON.stringify({
        report: base + '.json',
        probesCompleted: report.probes.filter((p) => p.status === 'completed')
          .length,
        error: report.error,
        restoredLimits: report.restoredLimits,
      }),
    );
  }
}
