import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { openDatabase } from '../src/adapters/database/index.ts';
import { createMemoryRepository } from '../src/adapters/database/memory-repository.ts';
import { createMemoryService } from '../src/application/memory/service.ts';
import { FactInputSchema } from '../src/domain/memory/model.ts';

const database = await openDatabase('file::memory:');

try {
  const repository = createMemoryRepository(
    database.client,
    'synthetic-benchmark',
  );
  const service = createMemoryService(
    repository,
    {
      execute: async () => {
        throw new Error('Este ensaio não permite inferência.');
      },
    },
    () => false,
  );

  for (let i = 0; i < 1000; i++) {
    await repository.createFact(
      FactInputSchema.parse({
        text: `Registro fictício independente número ${i}: preferência de teste ${i}.`,
        category: 'contexto',
        dataClass: 'synthetic',
        permission: 'eligible',
      }),
    );
  }

  for (const relation of [
    {
      text: 'Amadeus usa Cartesia para voz.',
      subject: 'Amadeus',
      object: 'Cartesia',
    },
    {
      text: 'O serviço utiliza o clone aprovado.',
      subject: 'Cartesia',
      object: 'Clone aprovado',
    },
  ]) {
    await repository.createFact(
      FactInputSchema.parse({
        text: relation.text,
        category: 'projeto',
        dataClass: 'synthetic',
        permission: 'eligible',
        relation: {
          subject: relation.subject,
          predicate: 'usa',
          object: relation.object,
        },
      }),
    );
  }

  const full = JSON.stringify(await repository.facts());
  const times = [];
  let context = '';

  for (let i = 0; i < 35; i++) {
    const started = performance.now();
    context = await service.retrieve(
      randomUUID(),
      'Qual clone usa Cartesia?',
      'synthetic',
    );

    if (i >= 5) {
      times.push(performance.now() - started);
    }
  }

  const unknown = await service.retrieve(
    randomUUID(),
    'assunto inexistente xyz',
    'synthetic',
  );

  if (
    !context.includes('Clone aprovado') ||
    context.includes('Registro fictício independente') ||
    context.length > 3050 ||
    unknown !== ''
  ) {
    throw new Error('A recuperação falhou nos critérios do ensaio.');
  }

  const sorted = times.toSorted((a, b) => a - b);
  const report = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    node: process.version,
    scope: 'synthetic-local-retrieval-only',
    factCount: 1002,
    measuredQueries: times.length,
    warmupQueries: 5,
    fullFactsCharacters: full.length,
    selectedContextCharacters: context.length,
    reductionVersusFullFactsPercent: (1 - context.length / full.length) * 100,
    retrievalP50Ms: sorted[Math.floor(sorted.length * 0.5)],
    retrievalP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    llmRequests: 0,
    notes:
      'Comparação com o envio integral dos fatos, não com o contexto anterior de produção. Caracteres não são tokens. Não mede latência de LLM/STT/TTS ou naturalidade.',
  };
  const directory = new URL('../data/memory-evals/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const target = new URL(Date.now() + '.json', directory);
  await writeFile(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
  await service.stop();
} finally {
  database.client.close();
}
