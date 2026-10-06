import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createLocalMemoryEmbeddings } from '../../src/adapters/embeddings/local.ts';
import { createLocalMemoryReranker } from '../../src/adapters/embeddings/reranker.ts';
import { RelationSchema } from '../../src/domain/memory/model.ts';
import { loadConfig } from '../../src/config/index.ts';
import {
  memoryTerms,
  selectRelevantFacts,
} from '../../src/application/memory/retrieval.ts';
import { FactSchema } from '../../src/domain/memory/model.ts';

it('falha com mensagem útil se o modelo local não foi provisionado', async () => {
  const path = fileURLToPath(
    new URL(`../../data/tests/missing-${randomUUID()}/`, import.meta.url),
  );
  const model = createLocalMemoryEmbeddings(path);

  try {
    await expect(
      model.embed(['Artificial fixture only.'], 'query'),
    ).rejects.toThrow('setup:memory-search');
  } finally {
    await model.close();
  }
}, 10000);

it('encerra requisições pendentes e não aceita novos trabalhos após parar', async () => {
  const model = createLocalMemoryEmbeddings('nonexistent-model-cache');
  const rejected = expect(
    model.embed(['Synthetic fixture.'], 'query'),
  ).rejects.toThrow('indisponível');
  await model.close();
  await rejected;
  await expect(model.embed(['Synthetic fixture.'], 'query')).rejects.toThrow(
    'indisponível',
  );
});

it('permite desativar busca semântica e preserva a configuração do cache', () => {
  const config = loadConfig({
    API_ACCESS_TOKEN: 'a'.repeat(32),
    MEMORY_SEMANTIC_ENABLED: 'false',
    MEMORY_MODEL_CACHE_DIRECTORY: './data/models',
  });
  expect(config.MEMORY_SEMANTIC_ENABLED).toBe(false);
  expect(config.MEMORY_MODEL_CACHE_DIRECTORY).toBe('./data/models');
  expect(() =>
    loadConfig({
      API_ACCESS_TOKEN: 'a'.repeat(32),
      MEMORY_SEMANTIC_ENABLED: 'sometimes',
    }),
  ).toThrow();
});

it('aceita predicados novos em outros idiomas e limita o contrato estrutural', () => {
  expect(
    RelationSchema.parse({
      subject: 'Aster',
      predicate: 'hosted_by',
      object: 'Nébula',
    }).predicate,
  ).toBe('hosted_by');
  expect(
    RelationSchema.parse({
      subject: '曲',
      predicate: '演奏する',
      object: '歌手',
    }).predicate,
  ).toBe('演奏する');
  expect(() =>
    RelationSchema.parse({
      subject: 'Aster',
      predicate: '<script>',
      object: 'Nébula',
    }),
  ).toThrow();
});

it('encerra o processo do classificador sem cache e rejeita trabalhos após encerrar', async () => {
  const model = createLocalMemoryReranker('nonexistent-reranker-cache');
  const pending = expect(
    model.rank('Artificial query', ['Synthetic fact.']),
  ).rejects.toThrow('indisponível');
  await model.close();
  await pending;
  await expect(
    model.rank('Artificial query', ['Synthetic fact.']),
  ).rejects.toThrow('indisponível');
});

it('não depende de expressões de identidade nem de stop words em português', () => {
  expect(memoryTerms('What is my name?')).toEqual(['what', 'name']);
  expect(memoryTerms('Qual é meu nome?')).toEqual(['qual', 'meu', 'nome']);
  expect(memoryTerms('星空观测 projeto X17')).toContain('星空观测');
});

it('não deixa coincidências genéricas anularem rejeição semântica e conserva nomes/códigos literais', () => {
  const fact = FactSchema.parse({
    id: randomUUID(),
    text: 'Meu telescópio é o modelo HX17.',
    category: 'contexto',
    dataClass: 'synthetic',
    permission: 'eligible',
    status: 'confirmed',
    version: 1,
    origin: 'user',
    createdAt: 0,
    updatedAt: 0,
    sources: [],
  });
  expect(
    selectRelevantFacts(
      [fact],
      'Qual é meu passaporte?',
      'synthetic',
      1800,
      new Map(),
      true,
    ),
  ).toEqual([]);
  expect(
    selectRelevantFacts([fact], 'HX17', 'synthetic', 1800, new Map(), true),
  ).toHaveLength(1);
});
