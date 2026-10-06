import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../src/adapters/database/index.ts';
import { createMemoryRepository } from '../src/adapters/database/memory-repository.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import { createLocalMemoryReranker } from '../src/adapters/embeddings/reranker.ts';
import { createMemoryService } from '../src/application/memory/service.ts';
import { FactInputSchema } from '../src/domain/memory/model.ts';
import { MemoryConfigSchema } from '../src/config/memory.ts';

// An isolated fixture database; no conversation/LLM/TTS API calls and no
// production memory reads. Runtime embeddings are strictly offline.
const directory = fileURLToPath(
  new URL('../data/memory-evals/', import.meta.url),
);
await mkdir(directory, { recursive: true });
const runId = 'retrieval-' + new Date().toISOString().replace(/[:.]/g, '-');
const databasePath = join(directory, runId + '.db');
const reportPath = join(directory, runId + '.json');
const config = MemoryConfigSchema.parse(process.env);
let database = await openDatabase(pathToFileURL(databasePath).href);
let repository = createMemoryRepository(database.client, 'evaluation');
const noInference = {
  execute: async () => {
    throw new Error('A avaliação não pode consultar LLMs.');
  },
};
const model = () =>
  createLocalMemoryEmbeddings(config.MEMORY_MODEL_CACHE_DIRECTORY);
const ranker = () =>
  config.MEMORY_RERANK_ENABLED
    ? createLocalMemoryReranker(config.MEMORY_MODEL_CACHE_DIRECTORY)
    : undefined;
let service = createMemoryService(
  repository,
  noInference,
  () => false,
  model(),
  ranker(),
);
const results = [];
const memories = [
  ['name', 'Usuário chama-se Nara Costa.', 'identidade'],
  ['coffee', 'Eu prefiro café sem açúcar.', 'preferencia'],
  ['solar', 'Meu telescópio usa um filtro de hidrogênio alfa.', 'contexto'],
  ['fungi', 'I grow oyster mushrooms on recycled coffee grounds.', 'contexto'],
  ['project', 'Estou desenvolvendo um aplicativo chamado Farol.', 'projeto'],
  [
    'music',
    'Eu gosto de ouvir jazz instrumental enquanto estudo.',
    'preferencia',
  ],
  ['garden', 'I water my orchids every Saturday morning.', 'contexto'],
  ['travel', 'Minha próxima viagem será para Kyoto em novembro.', 'contexto'],
];
const queries = [
  ['What is my name?', 'name'],
  ['Como você costuma me chamar?', 'name'],
  ['Você sabe quem eu sou?', 'name'],
  ['Do I sweeten my coffee?', 'coffee'],
  ['How do I take my coffee?', 'coffee'],
  ['Você lembra se eu adoço a bebida que tomo de manhã?', 'coffee'],
  ['O que eu uso para observar o Sol?', 'solar'],
  ['Which filter does my telescope use?', 'solar'],
  ['What do I use for growing fungi?', 'fungi'],
  ['Qual material eu aproveito para cultivar cogumelos?', 'fungi'],
  ['Preciso corrigir o nome do meu aplicativo para Aurora.', 'project'],
  ['What application am I building?', 'project'],
  ['Que som eu coloco enquanto estou estudando?', 'music'],
  ['What kind of music do I enjoy while studying?', 'music'],
  ['Quando eu rego minhas orquídeas?', 'garden'],
  ['On which day do I water my orchids?', 'garden'],
  ['Where am I planning to travel next?', 'travel'],
  ['Você lembra o destino da minha próxima viagem?', 'travel'],
  ['Qual é meu número de passaporte?', null],
  ['Como eu conserto um pneu furado?', null],
  ['Você sabe minha cidade natal?', null],
];

try {
  await service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: true,
    extraction: 'llm',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });
  const facts = new Map();
  for (const [key, text, category] of memories)
    facts.set(
      key,
      await repository.createFact(
        FactInputSchema.parse({
          text,
          category,
          dataClass: 'synthetic',
          permission: 'eligible',
        }),
      ),
    );
  for (const [query, expected] of queries) {
    const started = performance.now();
    const content = await service.retrieve(randomUUID(), query, 'synthetic');
    const ids = content ? JSON.parse(content).facts.map((fact) => fact.id) : [];
    results.push({
      query,
      expected,
      passed: expected
        ? ids.includes(facts.get(expected).id)
        : ids.length === 0,
      selected: ids.map(
        (id) => [...facts].find(([, fact]) => fact.id === id)?.[0] ?? 'other',
      ),
      durationMs: Math.round(performance.now() - started),
    });
  }
  const name = facts.get('name');
  const edited = await repository.editFact(name.id, name.version, {
    ...FactInputSchema.parse({
      text: 'Usuário chama-se Nara Lima.',
      category: 'identidade',
      dataClass: 'synthetic',
      permission: 'eligible',
    }),
    status: 'confirmed',
  });
  const afterEdit = await service.retrieve(
    randomUUID(),
    'What is my name?',
    'synthetic',
  );
  results.push({
    check: 'correction-reindex',
    passed: afterEdit.includes(edited.text) && !afterEdit.includes(name.text),
  });
  await repository.forgetFact(edited.id, edited.version, true);
  const afterForget = await service.retrieve(
    randomUUID(),
    'What is my name?',
    'synthetic',
  );
  results.push({ check: 'forget', passed: !afterForget.includes('Nara') });
  const privateFact = await repository.createFact(
    FactInputSchema.parse({
      text: 'Meu animal favorito é o pangolim.',
      category: 'preferencia',
      dataClass: 'personal',
      permission: 'local-only',
    }),
  );
  const remote = await service.retrieve(
    randomUUID(),
    'What is my favorite animal?',
    'personal',
  );
  results.push({
    check: 'private-memory-excluded',
    passed: !remote.includes(privateFact.id),
  });
  const indexed = Number(
    (
      await database.client.execute(
        'SELECT COUNT(*) AS count FROM memory_embeddings',
      )
    ).rows[0].count,
  );
  await service.stop();
  database.client.close();
  database = await openDatabase(pathToFileURL(databasePath).href);
  repository = createMemoryRepository(database.client, 'evaluation');
  service = createMemoryService(
    repository,
    noInference,
    () => false,
    model(),
    ranker(),
  );
  const restarted = await service.retrieve(
    randomUUID(),
    'How do I take my coffee?',
    'synthetic',
  );
  const afterRestart = Number(
    (
      await database.client.execute(
        'SELECT COUNT(*) AS count FROM memory_embeddings',
      )
    ).rows[0].count,
  );
  results.push({
    check: 'persisted-index-restart',
    passed:
      restarted.includes(facts.get('coffee').text) && indexed === afterRestart,
  });
  const report = {
    model: (await service.status()).search,
    ranking: (await service.status()).ranking,
    externalInferenceCalls: 0,
    syntheticOnly: true,
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    results,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        total: report.total,
        externalInferenceCalls: 0,
        reportPath,
        failures: results.filter((result) => !result.passed),
      },
      null,
      2,
    ),
  );
  if (report.passed !== report.total) process.exitCode = 1;
} finally {
  await service.stop();
  database.client.close();
}
