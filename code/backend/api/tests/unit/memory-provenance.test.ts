import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { FactSchema } from '../../src/domain/memory/model.ts';
import { selectRelevantFacts } from '../../src/application/memory/retrieval.ts';
import { extractionFactContext } from '../../src/application/memory/extraction.ts';

it('inclui um complemento confirmado da mesma fala, sem inferir relações ou atravessar fontes privadas', () => {
  const turnId = randomUUID(),
    conversationId = randomUUID();
  const fact = (text: string, source: string, permission = 'eligible') =>
    FactSchema.parse({
      id: randomUUID(),
      text,
      category: 'contexto',
      status: 'confirmed',
      dataClass: 'synthetic',
      permission,
      version: 1,
      origin: 'llm-extraction',
      createdAt: 0,
      updatedAt: 0,
      sources: [
        {
          turnId: source,
          conversationId,
          evidence: 'Trecho fictício do ensaio.',
        },
      ],
      relation: null,
    });
  const seed = fact('Playlist Brisa é uma referência musical.', turnId);
  const complement = fact('Gosto de Aurora Boreal.', turnId);
  const privateFact = fact('Detalhe reservado.', turnId, 'local-only');
  const unrelated = fact('Outra informação.', randomUUID());
  const selected = selectRelevantFacts(
    [seed, complement, privateFact, unrelated],
    'Brisa',
    'synthetic',
    3000,
    new Map([[seed.id, 0.9]]),
    true,
  );
  expect(selected.map((f) => f.id)).toEqual([seed.id, complement.id]);
  expect(selected[1]!.relation).toBeNull();
  expect(JSON.stringify(selected)).not.toContain('Trecho fictício');
});

it('prioriza a interpretação da fonte reprocessada dentro do orçamento, sem trazer fontes revogadas ou privadas', () => {
  const turnId = randomUUID(),
    conversationId = randomUUID();
  const source = {
    id: turnId,
    conversationId,
    userText: 'Não indiquei uma fruta favorita.',
    assistantConfirmed: '',
    partiallyPlayed: false,
    responseStatus: 'completed',
    dataClass: 'synthetic' as const,
  };
  const make = (text: string, sourceId: string) =>
    FactSchema.parse({
      id: randomUUID(),
      text,
      category: 'preferencia',
      dataClass: 'synthetic',
      permission: 'eligible',
      status: 'confirmed',
      origin: 'llm-extraction',
      version: 2,
      createdAt: 0,
      updatedAt: 0,
      sources: [
        { turnId: sourceId, conversationId, evidence: source.userText },
      ],
    });
  const other = make('Gosto de maçãs.', randomUUID());
  const interpretation = make('Não tenho fruta favorita.', turnId);
  const revoked = make('Outra interpretação revogada.', turnId);
  revoked.sources[0]!.contextValid = false;
  const privateFact = make('Detalhe privado.', turnId);
  privateFact.permission = 'local-only';
  const expired = make('Evento vencido.', turnId);
  expired.expiresAt = 1;
  const budget = JSON.stringify([
    {
      id: interpretation.id,
      version: interpretation.version,
      text: interpretation.text,
      kind: interpretation.kind,
      expiresAt: interpretation.expiresAt,
      relation: interpretation.relation,
    },
  ]).length;
  const result = extractionFactContext(
    [other, expired, interpretation, revoked, privateFact],
    [other.id],
    [source],
    'synthetic',
    budget,
  );
  expect(result.known.map((fact) => fact.id)).toEqual([interpretation.id]);
  expect(result.wire[0]).toMatchObject({ id: interpretation.id, version: 2 });
  expect(JSON.stringify(result.wire).length).toBeLessThanOrEqual(budget);
  expect(JSON.stringify(result.wire)).not.toContain('evidence');
});
