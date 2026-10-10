import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { FactSchema } from '../../src/domain/memory/model.ts';
import { selectRelevantFacts } from '../../src/application/memory/retrieval.ts';

const facts = () =>
  Array.from({ length: 12 }, (_, i) =>
    FactSchema.parse({
      id: randomUUID(),
      text: `Synthetic detail ${i}.`,
      category: 'contexto',
      dataClass: 'synthetic',
      permission: 'eligible',
      status: 'confirmed',
      origin: 'llm-extraction',
      version: 1,
      createdAt: i,
      updatedAt: i,
      sources: [],
    }),
  );

it('prefere três resultados distintos sem inflar relevância pelo deslocamento do score híbrido', () => {
  const entries = facts();
  const scores = new Map(
    entries.map((fact, i) => [fact.id, [0.95, 0.85, 0.75, 0.3][i] ?? 0.1]),
  );
  expect(
    selectRelevantFacts(
      entries,
      'query',
      'synthetic',
      5000,
      scores,
      true,
      true,
    ).map((f) => f.id),
  ).toEqual(entries.slice(0, 3).map((f) => f.id));
});

it('mantém empate relevante dentro do limite sem encaminhar memória privada', () => {
  const entries = facts();
  entries[0]!.permission = 'local-only';
  const scores = new Map(entries.map((f) => [f.id, 0.9]));
  const selected = selectRelevantFacts(
    entries,
    'query',
    'synthetic',
    5000,
    scores,
    true,
    true,
  );
  expect(selected).toHaveLength(8);
  expect(selected.map((f) => f.id)).not.toContain(entries[0]!.id);
});

it('preserva até dois complementos de uma fonte direta sem despejar toda a conversa', () => {
  const entries = facts(),
    turnId = randomUUID(),
    conversationId = randomUUID();

  for (const fact of entries) {
    fact.sources = [
      {
        turnId,
        conversationId,
        evidence: 'Fonte longa que não deve ir ao prompt.',
      },
    ];
  }

  const scores = new Map([[entries[0]!.id, 0.9]]);
  const selected = selectRelevantFacts(
    entries,
    'query',
    'synthetic',
    5000,
    scores,
    true,
    true,
  );
  expect(selected).toHaveLength(3);
  expect(JSON.stringify(selected)).not.toContain('Fonte longa');
});
