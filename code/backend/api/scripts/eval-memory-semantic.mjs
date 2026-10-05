import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createMemoryProvider } from '../src/application/memory/provider.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';
import { FactSchema } from '../src/domain/memory/model.ts';
import { MemoryExtractorConfigurationSchema } from '../src/domain/memory/extractor.ts';
import {
  MEMORY_EXTRACTION_PROMPT,
  parseMemoryExtraction,
} from '../src/application/memory/extraction.ts';

const config = loadConfig();
const database = await openDatabase(config.DATABASE_URL);
try {
  const profilePath = process.argv
    .find((argument) => argument.startsWith('--profile='))
    ?.slice('--profile='.length);
  const candidate = profilePath
    ? MemoryExtractorConfigurationSchema.parse({
        ...JSON.parse(
          (await readFile(profilePath, 'utf8')).replace(/^\uFEFF/, ''),
        ),
        revision: 0,
        updatedAt: null,
      })
    : null;
  const storedRevisions = createRevisionRepository(database.client);
  const provider = createMemoryProvider({
    revisions: candidate
      ? {
          read: async (key) =>
            key === `memory-extractor:${config.OWNER_ID}`
              ? JSON.stringify(candidate)
              : storedRevisions.read(key),
          compareAndSave: async () => {
            throw new Error('Um ensaio não altera a configuração ativa.');
          },
        }
      : storedRevisions,
    conversationConfiguration: new SqliteProviderConfigurationRepository(
      database.client,
    ),
    usage: new SqliteProviderUsageRepository(database.client),
    factory: createProviderFactory(process.env),
    ownerId: config.OWNER_ID,
    gate: new ActivityGate(1),
  });
  const configuration = await provider.get();
  if (!process.argv.includes('--run')) {
    console.log(
      JSON.stringify(
        {
          model: configuration.provider.model,
          profile: profilePath ?? 'active',
          persistConfiguration: false,
          requests: 1,
          dataClass: 'synthetic',
          persistFacts: false,
          instruction:
            'Use --run para consumir uma chamada do extrator configurado.',
        },
        null,
        2,
      ),
    );
  } else {
    const now = Date.now();
    const conversationId = randomUUID();
    const sources = [
      'Se botarem açúcar no meu café, eu não bebo. Sempre tomo sem açúcar.',
      'O aplicativo que estou montando chama-se Aurora.',
      'Nele, estou usando SQLite para manter as informações.',
      'Hoje estou cansado porque dormi pouco.',
      'Numa história inventada, eu seria um astronauta.',
      'Mudei de sistema: agora uso Linux em vez de Windows.',
      'Oi, como foi seu dia?',
    ].map((userText) => ({
      id: randomUUID(),
      conversationId,
      userText,
      assistantConfirmed: '',
      partiallyPlayed: false,
      responseStatus: 'completed',
      dataClass: 'synthetic',
      createdAt: now,
    }));
    const old = FactSchema.parse({
      id: randomUUID(),
      text: 'Usuário utiliza Windows como sistema operacional.',
      category: 'contexto',
      status: 'confirmed',
      dataClass: 'synthetic',
      permission: 'eligible',
      version: 1,
      origin: 'user',
      createdAt: now,
      updatedAt: now,
      sources: [],
      relation: { subject: 'usuário', predicate: 'usa', object: 'Windows' },
    });
    const started = performance.now();
    let executionError = null;
    const result = await provider
      .execute(
        'llm',
        {
          purpose: 'memory',
          systemPrompt: MEMORY_EXTRACTION_PROMPT,
          content: JSON.stringify({
            currentSources: sources.map((source) => ({
              ...source,
              turnId: source.id,
            })),
            previousSources: [],
            existingFacts: [
              {
                id: old.id,
                version: old.version,
                text: old.text,
                kind: old.kind,
                relation: old.relation,
              },
            ],
          }),
          dataClass: 'synthetic',
          maxTokens: 4096,
        },
        AbortSignal.timeout(45000),
      )
      .catch((error) => {
        executionError = {
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.message,
        };
        return null;
      });
    let facts = [];
    let validationError = executionError;
    if (result) {
      try {
        facts = parseMemoryExtraction(result.content, sources, sources, [old]);
      } catch (error) {
        validationError = { code: error.code, message: error.message };
      }
    }
    const has = (sourceIndex, predicate) =>
      facts.some(
        (fact) =>
          fact.evidence.some((e) => e.turnId === sources[sourceIndex].id) &&
          predicate(fact),
      );
    const checks = {
      validContract: validationError === null,
      naturalPreference: has(
        0,
        (fact) => fact.kind === 'fact' && /café|cafe/i.test(fact.text),
      ),
      contextualReference: has(
        2,
        (fact) =>
          JSON.stringify(fact).includes('Aurora') &&
          JSON.stringify(fact).includes('SQLite') &&
          fact.evidence.some((e) => e.turnId === sources[1].id),
      ),
      temporaryEvent: has(3, (fact) => fact.kind === 'event'),
      fictionExcluded: !has(4, () => true),
      linkedCorrection: has(
        5,
        (fact) =>
          fact.kind === 'correction' &&
          fact.supersedes?.factId === old.id &&
          fact.supersedes?.version === old.version,
      ),
      greetingExcluded: !has(6, () => true),
    };
    if (validationError) {
      for (const check of Object.keys(checks)) {
        if (check !== 'validContract') checks[check] = null;
      }
    }
    const report = {
      createdAt: new Date().toISOString(),
      model: configuration.provider.model,
      profile: profilePath ?? 'active',
      requests: 1,
      elapsedMs: performance.now() - started,
      inputTokens: result?.inputTokens ?? null,
      outputTokens: result?.outputTokens ?? null,
      checks,
      allChecksPassed: Object.values(checks).every(Boolean),
      sources,
      existingFacts: [old],
      facts,
      rawResponse: result?.content ?? null,
      executionError,
      validationError,
      scope:
        'Uma chamada com sete falas fictícias e seis verificações básicas; não é avaliação abrangente de qualidade semântica.',
    };
    const directory = fileURLToPath(
      new URL('../data/memory-evals/', import.meta.url),
    );
    await mkdir(directory, { recursive: true });
    const path = join(
      directory,
      'semantic-' + report.createdAt.replace(/[:.]/g, '-') + '.json',
    );
    await writeFile(path, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
    });
    console.log(
      JSON.stringify(
        {
          model: report.model,
          requests: 1,
          elapsedMs: report.elapsedMs,
          checks,
          executionError,
          validationError,
          report: path,
        },
        null,
        2,
      ),
    );
    if (!report.allChecksPassed) process.exitCode = 1;
  }
} finally {
  database.client.close();
}
