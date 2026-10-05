import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { createMemoryRepository } from '../src/adapters/database/memory-repository.ts';
import { createSqliteCallHistory } from '../src/adapters/database/call-history-repository.ts';
import { SqliteConversationRepository } from '../src/adapters/database/conversation-repository.ts';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createMemoryProvider } from '../src/application/memory/provider.ts';
import { createMemoryService } from '../src/application/memory/service.ts';
import { createProviderServices } from '../src/application/providers/index.ts';
import { buildVoiceContext } from '../src/application/voice/context.ts';
import {
  memoryContent,
  memoryDirection,
} from '../src/application/memory/context.ts';
import { readPersonaResponse } from '../src/application/persona/response-stream.ts';
import {
  applyPersonaConfiguration,
  createPersonaConfiguration,
} from '../src/application/persona/configuration.ts';
import { normalizeMemory } from '../src/domain/memory/model.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';

const resumePath = process.argv
  .find((argument) => argument.startsWith('--resume='))
  ?.slice('--resume='.length);
if (!process.argv.includes('--run')) {
  console.log(
    JSON.stringify(
      {
        dataClass: 'synthetic',
        persistProductionFacts: false,
        extractionCalls: resumePath ? 0 : 3,
        conversationCalls: resumePath ? 1 : 3,
        retries: 0,
        instruction:
          'Use --run. Tentativas de reserva do roteamento podem consumir chamadas adicionais; limites e cotas reais continuam valendo.',
      },
      null,
      2,
    ),
  );
} else {
  await run().catch((error) => {
    console.error(
      JSON.stringify({
        code: error.code ?? 'INTERNAL_ERROR',
        message: error.message,
      }),
    );
    process.exitCode = 1;
  });
}

async function run() {
  const config = loadConfig();
  const directory = fileURLToPath(
    new URL('../data/memory-evals/', import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString();
  const prefix = directory + '/integrated-' + timestamp.replace(/[:.]/g, '-');
  let isolated;
  let memory;
  let report = {
    createdAt: timestamp,
    dataClass: 'synthetic',
    scope:
      'Extração e respostas textuais reais; SQLite isolado, sem STT/TTS ou teste físico.',
    checks: {},
    replies: [],
    executions: [],
    error: null,
    database: prefix + '.db',
  };
  if (resumePath) {
    const target = resolve(resumePath);
    const scope = relative(directory, target);
    if (!scope || scope.startsWith('..') || isAbsolute(scope))
      throw new Error('O relatório deve estar em data/memory-evals/.');
    const previous = JSON.parse(await readFile(target, 'utf8'));
    const databaseScope = relative(directory, resolve(previous.database));
    if (
      previous.dataClass !== 'synthetic' ||
      previous.checks?.rebuildDoesNotRestoreForgottenFact !== true ||
      !databaseScope ||
      databaseScope.startsWith('..') ||
      isAbsolute(databaseScope)
    )
      throw new Error(
        'Somente o checkpoint sintético após esquecimento pode ser retomado.',
      );
    report = {
      ...previous,
      createdAt: timestamp,
      resumedFrom: target,
      priorErrors: [...(previous.priorErrors ?? []), previous.error],
      error: null,
    };
  }
  const production = await openDatabase(config.DATABASE_URL);
  try {
    const revisions = createRevisionRepository(production.client);
    const configuration = new SqliteProviderConfigurationRepository(
      production.client,
    );
    const usage = new SqliteProviderUsageRepository(production.client);
    const gate = new ActivityGate(1);
    const realFactory = createProviderFactory(process.env);
    const factory = (role, providerConfig) => {
      const service = realFactory(role, providerConfig);
      return {
        ...service,
        async execute(input, signal) {
          const record = {
            role,
            adapter: providerConfig.adapter,
            model: providerConfig.model,
            purpose: input.purpose ?? 'conversation',
            succeeded: false,
          };
          report.executions.push(record);
          const result = await service.execute(input, signal);
          record.succeeded = true;
          return result;
        },
      };
    };
    const extractor = createMemoryProvider({
      revisions,
      conversationConfiguration: configuration,
      usage,
      factory,
      ownerId: config.OWNER_ID,
      gate,
    });
    const main = createProviderServices({
      configuration,
      usage,
      factory,
      ownerId: config.OWNER_ID,
      gate,
    });
    const persona = await createPersonaConfiguration(
      revisions,
      config.OWNER_ID,
    ).get();
    report.extractorModel = (await extractor.get()).provider.model;
    isolated = await openDatabase(pathToFileURL(report.database).href);
    const owner = 'integrated-synthetic';
    const repo = createMemoryRepository(isolated.client, owner);
    const history = createSqliteCallHistory(isolated.client);
    const conversations = new SqliteConversationRepository(isolated.client);
    memory = createMemoryService(
      repo,
      {
        ...extractor,
        async execute(...args) {
          try {
            return await extractor.execute(...args);
          } catch (error) {
            report.extractionFailure = {
              code: error.code ?? 'INTERNAL_ERROR',
              message: error.message,
            };
            throw error;
          }
        },
      },
      () => false,
    );
    if (!resumePath)
      await memory.configure({
        expectedRevision: 0,
        enabled: true,
        personalEnabled: false,
        extraction: 'llm',
        retentionDays: null,
      });
    const check = (name, condition) => {
      report.checks[name] = Boolean(condition);
      if (!condition) throw new Error('Falhou: ' + name);
    };
    async function extract(texts) {
      const conversation = await conversations.create(owner);
      const sessionId = randomUUID();
      await history.startSession({
        id: sessionId,
        conversationId: conversation.id,
        ownerId: owner,
        voiceProfileId: null,
      });
      for (const [index, text] of texts.entries()) {
        const responseId = randomUUID();
        await history.beginTurn({
          id: randomUUID(),
          responseId,
          sessionId,
          conversationId: conversation.id,
          clientTurnId: index + 1,
          dataClass: 'synthetic',
        });
        await history.updateTurn(responseId, {
          userText: text,
          status: 'completed',
        });
      }
      await history.endSession(sessionId, 'closed');
      await memory.runOnce();
      const failed = (await repo.jobs()).find(
        (job) =>
          job.conversationId === conversation.id && job.status !== 'completed',
      );
      if (failed)
        throw Object.assign(
          new Error(
            'Extração adiada ou inválida: ' +
              failed.lastError +
              (report.extractionFailure
                ? ' (' + report.extractionFailure.message + ')'
                : ''),
          ),
          { code: failed.lastError },
        );
      return conversation.id;
    }
    async function confirm(fact) {
      return memory.edit(fact.id, fact.version, {
        ...fact,
        status: 'confirmed',
        permission: 'eligible',
      });
    }
    async function reply(query) {
      const selected = await memory.retrieve(randomUUID(), query, 'synthetic');
      const context = buildVoiceContext([], query, 'synthetic');
      context.content = memoryContent(context.content, selected);
      context.systemPrompt =
        applyPersonaConfiguration(context.systemPrompt, persona) +
        memoryDirection(selected);
      const output = await main.execute(
        'llm',
        { ...context, maxTokens: 512 },
        AbortSignal.timeout(45000),
      );
      let spoken = '';
      for await (const segment of readPersonaResponse(
        (async function* () {
          yield output.content;
        })(),
        () => {},
      ))
        spoken += segment;
      report.replies.push({ query, selectedMemory: selected, text: spoken });
      return normalizeMemory(spoken);
    }
    if (resumePath) {
      await verifyRestart();
      const forgottenReply = await reply('Como eu gosto do meu café?');
      check(
        'realReplyDoesNotInventForgottenPreference',
        !forgottenReply.includes('com acucar') &&
          !forgottenReply.includes('sem acucar'),
      );
      return;
    }
    const initialConversation = await extract([
      'Eu prefiro café sem açúcar.',
      'Numa história totalmente inventada, sou um astronauta que mora na Lua.',
      'Hoje estou cansado, mas isso é temporário, só por hoje.',
    ]);
    let facts = await repo.facts();
    report.initialFacts = facts;
    const coffee = facts.find(
      (f) => /café|cafe/i.test(f.text) && f.kind === 'fact',
    );
    check(
      'naturalPreferenceSuggested',
      coffee?.status === 'suggested' && coffee.permission === 'local-only',
    );
    check(
      'fictionExcluded',
      !facts.some((f) => /astronauta|lua/i.test(f.text)),
    );
    const event = facts.find((f) => f.kind === 'event');
    check('temporaryEvent', event?.expiresAt > Date.now());
    check(
      'suggestionNotRetrieved',
      (await memory.retrieve(
        randomUUID(),
        'Como gosto do café?',
        'synthetic',
      )) === '',
    );
    await confirm(coffee);
    await confirm(event);
    const firstReply = await reply('Como eu gosto do meu café?');
    check('realReplyUsesPreference', firstReply.includes('sem acucar'));
    const correctionConversation = await extract([
      'Mudei minha preferência de café: agora prefiro café com açúcar, em vez de sem açúcar.',
    ]);
    facts = await repo.facts();
    const correction = facts.find(
      (f) => f.kind === 'correction' && f.supersedes?.factId === coffee.id,
    );
    check('correctionLinked', Boolean(correction));
    check(
      'oldFactBeforeReview',
      (
        await memory.retrieve(randomUUID(), 'Como gosto do café?', 'synthetic')
      ).includes('sem açúcar'),
    );
    const corrected = await confirm(correction);
    const context = await memory.retrieve(
      randomUUID(),
      'Como gosto do café?',
      'synthetic',
    );
    check(
      'correctionReplacesFact',
      context.includes('com açúcar') &&
        !JSON.parse(context).facts.some((f) => f.id === coffee.id),
    );
    check(
      'realReplyUsesCorrection',
      (await reply('Qual é a minha preferência atual de café?')).includes(
        'com acucar',
      ),
    );
    await repo.purgeExpired(event.expiresAt + 1);
    check(
      'temporaryEventExpired',
      !(await repo.facts()).some((f) => f.id === event.id),
    );
    const previousSession = randomUUID();
    await history.startSession({
      id: previousSession,
      conversationId: initialConversation,
      ownerId: owner,
      voiceProfileId: null,
    });
    await history.endSession(previousSession, 'closed');
    await history.validateResume(previousSession, initialConversation, owner);
    await history.startSession({
      id: randomUUID(),
      conversationId: initialConversation,
      ownerId: owner,
      voiceProfileId: null,
      resume: { previousSessionId: previousSession, lastSeq: 0 },
    });
    check(
      'resumeRecordedWithoutReplay',
      Number(
        (
          await isolated.client.execute(
            'SELECT COUNT(*) AS count FROM memory_resumptions',
          )
        ).rows[0].count,
      ) === 1,
    );
    await memory.forget(corrected.id, corrected.version, false);
    check(
      'forgottenNotRetrieved',
      (await memory.retrieve(
        randomUUID(),
        'Como gosto do café?',
        'synthetic',
      )) === '',
    );
    await memory.rebuild(correctionConversation);
    await memory.runOnce();
    check(
      'rebuildDoesNotRestoreForgottenFact',
      !(await repo.facts()).some(
        (f) => /café|cafe/i.test(f.text) && f.status !== 'superseded',
      ),
    );
    const forgottenReply = await reply('Como eu gosto do meu café?');
    check(
      'realReplyDoesNotInventForgottenPreference',
      !forgottenReply.includes('com acucar') &&
        !forgottenReply.includes('sem acucar'),
    );
    async function verifyRestart() {
      const restarted = await promisify(execFile)(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
      import { openDatabase } from './src/adapters/database/index.ts';
      import { createMemoryRepository } from './src/adapters/database/memory-repository.ts';
      import { createMemoryService } from './src/application/memory/service.ts';
      import { pathToFileURL } from 'node:url';
      const db = await openDatabase(pathToFileURL(process.env.TEST_INTEGRATED_MEMORY_DATABASE).href);
      try {
        const repo = createMemoryRepository(db.client, 'integrated-synthetic');
        await repo.recover();
        const service = createMemoryService(repo, { execute: async()=>{throw new Error('No inference');} }, ()=>false);
        console.log(JSON.stringify({ context: await service.retrieve('00000000-0000-4000-8000-000000000001', 'cafe', 'synthetic'), blocked: (await db.client.execute('SELECT COUNT(*) AS count FROM memory_blocked_turns')).rows[0].count, resumptions: (await db.client.execute('SELECT COUNT(*) AS count FROM memory_resumptions')).rows[0].count }));
      } finally { db.client.close(); }
    `,
        ],
        {
          env: {
            ...process.env,
            TEST_INTEGRATED_MEMORY_DATABASE: report.database,
          },
          windowsHide: true,
          encoding: 'utf8',
        },
      );
      report.restart = JSON.parse(restarted.stdout);
      check(
        'restartPreservesForgetAndResume',
        report.restart.context === '' &&
          report.restart.blocked > 0 &&
          report.restart.resumptions === 1,
      );
    }
    await verifyRestart();
  } catch (error) {
    report.error = {
      code: error.code ?? 'EVALUATION_FAILED',
      message: error.message,
    };
    process.exitCode = 1;
  } finally {
    await memory?.stop();
    isolated?.client.close();
    production.client.close();
    report.allChecksPassed =
      !report.error && Object.values(report.checks).every(Boolean);
    await writeFile(prefix + '.json', JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
    });
    console.log(
      JSON.stringify(
        {
          checks: report.checks,
          replies: report.replies.map((r) => ({
            query: r.query,
            text: r.text,
          })),
          executions: report.executions,
          error: report.error,
          report: prefix + '.json',
        },
        null,
        2,
      ),
    );
  }
}
