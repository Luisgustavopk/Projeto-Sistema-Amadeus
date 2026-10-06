import { randomUUID, createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createMemoryRepository } from '../../src/adapters/database/memory-repository.ts';
import { createMemoryService } from '../../src/application/memory/service.ts';
import { createSemanticMemorySearch } from '../../src/application/memory/semantic-search.ts';
import {
  embeddingText,
  MEMORY_EMBEDDING_DIMENSIONS,
} from '../../src/domain/memory/embeddings.ts';
import {
  FactInputSchema,
  MemoryStatusSchema,
} from '../../src/domain/memory/model.ts';
import type { MemoryEmbeddings } from '../../src/ports/memory-embeddings.ts';
import type { MemoryReranker } from '../../src/ports/memory-reranker.ts';
import { MEMORY_CONTEXT_CHARACTERS } from '../../src/domain/memory/ranking.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import { SqliteConversationRepository } from '../../src/adapters/database/conversation-repository.ts';
import { createSqliteCallHistory } from '../../src/adapters/database/call-history-repository.ts';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});
const vector = (axis: number) =>
  Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, (_, index) =>
    Number(index === axis),
  );
const input = (text: string, overrides = {}) =>
  FactInputSchema.parse({
    text,
    category: 'contexto',
    dataClass: 'synthetic',
    permission: 'eligible',
    ...overrides,
  });

it('preserva co-menção somente entre fatos selecionados e autorizados, sem expor a fala ou inventar arestas', async () => {
  const f = await fixture();
  const conversation = await new SqliteConversationRepository(
    f.db.client,
  ).create('primary');
  const history = createSqliteCallHistory(f.db.client);
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const responseId = randomUUID();
  await history.startSession({
    id: sessionId,
    conversationId: conversation.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await history.beginTurn({
    id: turnId,
    responseId,
    sessionId,
    conversationId: conversation.id,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await history.updateTurn(responseId, {
    userText: 'Minha lista Brisa. Gosto de Aurora Boreal. Trecho reservado.',
    status: 'completed',
  });
  const seed = await f.repo.createFact(
    input('Tenho a lista Brisa.', { relation: null }),
  );
  const complement = await f.repo.createFact(
    input('Gosto de Aurora Boreal.', { relation: null }),
  );
  const privateFact = await f.repo.createFact(
    input('Trecho reservado.', { permission: 'local-only' }),
  );

  for (const fact of [seed, complement, privateFact]) {
    await f.db.client.execute({
      sql: "UPDATE memory_facts SET origin = 'llm-extraction' WHERE id = ?",
      args: [fact.id],
    });
    await f.db.client.execute({
      sql: 'INSERT INTO memory_fact_sources VALUES (?, ?, ?)',
      args: [fact.id, turnId, 'Trecho reservado.'],
    });
  }

  f.labels.set(seed.text, 0);
  f.labels.set(complement.text, 0);
  f.labels.set('Que artistas citei ao falar de Brisa?', 0);
  const content = await f.service.retrieve(
    randomUUID(),
    'Que artistas citei ao falar de Brisa?',
    'synthetic',
  );
  const selected = JSON.parse(content);
  expect(selected.facts.map((fact: { id: string }) => fact.id)).toEqual([
    seed.id,
    complement.id,
  ]);
  expect(selected.coMentioned).toEqual([[0, 1]]);
  expect(
    selected.facts.every(
      (fact: { relation: unknown }) => fact.relation === null,
    ),
  ).toBe(true);
  expect(content).not.toContain('Trecho reservado');
  expect(content).not.toContain(turnId);
  expect(content).not.toContain(privateFact.id);
  expect(content.length).toBeLessThanOrEqual(MEMORY_CONTEXT_CHARACTERS);
  await f.db.client.execute({
    sql: 'INSERT INTO memory_blocked_turns VALUES (?, ?, ?)',
    args: ['primary', turnId, 'superseded'],
  });
  const invalidated = JSON.parse(
    await f.service.retrieve(
      randomUUID(),
      'Que artistas citei ao falar de Brisa?',
      'synthetic',
    ),
  );
  expect(invalidated.coMentioned).toBeUndefined();
  expect(invalidated.facts).toHaveLength(2);
  expect(
    (await f.repo.facts())
      .flatMap((fact) => fact.sources)
      .every((source) => source.contextValid === false),
  ).toBe(true);
  await f.db.client.execute({
    sql: "UPDATE memory_facts SET origin = 'user' WHERE id IN (?, ?)",
    args: [seed.id, complement.id],
  });
  const edited = JSON.parse(
    await f.service.retrieve(
      randomUUID(),
      'Que artistas citei ao falar de Brisa?',
      'synthetic',
    ),
  );
  expect(edited.coMentioned).toBeUndefined();
  expect(edited.facts.map((fact: { id: string }) => fact.id)).toEqual([
    seed.id,
    complement.id,
  ]);
});

async function fixture(reranker?: MemoryReranker) {
  const db = await openDatabase('file::memory:');
  cleanup.push(() => db.client.close());
  const repo = createMemoryRepository(db.client, 'primary');
  const labels = new Map<string, number>();
  const embed = vi.fn<MemoryEmbeddings['embed']>(async (texts) =>
    texts.map((text) => vector(labels.get(text) ?? 7)),
  );
  const model = {
    key: 'test-multilingual-model-v1',
    embed,
    close: vi.fn(async () => undefined),
  };
  const execute = vi.fn<ProviderServices['execute']>(async () => {
    throw new Error('Não deve consultar LLM.');
  });
  const service = createMemoryService(
    repo,
    { execute },
    () => false,
    model,
    reranker,
  );
  cleanup.push(() => service.stop());
  await service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: true,
    extraction: 'llm',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });

  return { db, repo, labels, embed, model, execute, service };
}

it('recupera sem palavras compartilhadas e reutiliza embeddings persistidos após recriar o serviço', async () => {
  const f = await fixture();
  const fact = await f.repo.createFact(
    input('Cultivo cogumelos em borra reciclada.', { relation: null }),
  );
  f.labels.set(fact.text, 0);
  f.labels.set('What substrate do I use for growing fungi?', 0);
  expect(
    await f.service.retrieve(
      randomUUID(),
      'What substrate do I use for growing fungi?',
      'synthetic',
    ),
  ).toContain(fact.text);
  expect(f.execute).not.toHaveBeenCalled();
  await f.service.stop();
  const embed = vi.fn<MemoryEmbeddings['embed']>(async (texts, kind) => {
    if (kind === 'passage') {
      throw new Error('Índice deveria ser reutilizado.');
    }

    return texts.map(() => vector(0));
  });
  const restarted = createMemoryService(
    f.repo,
    { execute: f.execute },
    () => false,
    { ...f.model, embed },
  );
  cleanup.push(() => restarted.stop());
  expect(
    await restarted.retrieve(randomUUID(), 'Outra paráfrase', 'synthetic'),
  ).toContain(fact.text);
  expect(embed).toHaveBeenCalledExactlyOnceWith(['Outra paráfrase'], 'query');
  expect(
    MemoryStatusSchema.parse(await restarted.status()).search,
  ).toMatchObject({ state: 'ready', indexedFacts: 1 });
});

it('filtra proprietário, permissão, classificação, confirmação e validade antes da inferência', async () => {
  const f = await fixture();
  const own = await f.repo.createFact(input('Memória sintética autorizada.'));
  const personal = await f.repo.createFact(
    input('Memória pessoal autorizada.', { dataClass: 'personal' }),
  );
  const privateFact = await f.repo.createFact(
    input('Memória pessoal privada.', {
      dataClass: 'personal',
      permission: 'local-only',
    }),
  );
  const local = await f.repo.createFact(
    input('Memória estritamente local.', { dataClass: 'local-only' }),
  );
  const expired = await f.repo.createFact(
    input('Acontecimento vencido.', {
      kind: 'event',
      expiresAt: Date.now() - 1000,
    }),
  );
  const pending = await f.repo.createFact(
    input('Sugestão ainda não confirmada.'),
  );
  await f.repo.editFact(pending.id, pending.version, {
    ...input(pending.text),
    status: 'suggested',
  });
  const other = createMemoryRepository(f.db.client, 'other');
  await other.createFact(input('Informação de outro proprietário.'));
  const embedTexts = () =>
    f.embed.mock.calls
      .filter(([, kind]) => kind === 'passage')
      .flatMap(([texts]) => texts);
  await f.service.retrieve(randomUUID(), 'consulta', 'synthetic');
  expect(embedTexts()).toEqual([own.text]);
  f.embed.mockClear();
  await f.service.retrieve(randomUUID(), 'consulta', 'personal');
  expect(embedTexts()).toEqual([personal.text]);
  f.embed.mockClear();
  await f.service.retrieve(randomUUID(), 'consulta', 'local-only');
  expect(embedTexts().sort()).toEqual([privateFact.text, local.text].sort());
  expect(embedTexts()).not.toContain(expired.text);
});

it('invalida o índice ao editar e esquecer; uma gravação atrasada não recria versões antigas', async () => {
  const f = await fixture();
  const fact = await f.repo.createFact(input('Prefiro café puro.'));
  f.labels.set(fact.text, 0);
  f.labels.set('How do I take my coffee?', 0);
  await f.service.retrieve(
    randomUUID(),
    'How do I take my coffee?',
    'synthetic',
  );
  const old = (await f.repo.embeddingPage(f.model.key, 'synthetic'))[0]!;
  const updated = await f.repo.editFact(fact.id, fact.version, {
    ...input('Agora prefiro chá verde.'),
    status: 'confirmed',
  });
  f.labels.set(updated.text, 1);
  expect(
    (await f.repo.embeddingPage(f.model.key, 'synthetic'))[0]!.vector,
  ).toBeNull();
  await f.repo.saveEmbedding(old, f.model.key, old.contentHash!, old.vector!);
  expect(
    (await f.repo.embeddingPage(f.model.key, 'synthetic'))[0]!.vector,
  ).toBeNull();
  expect(
    await f.service.retrieve(
      randomUUID(),
      'How do I take my coffee?',
      'synthetic',
    ),
  ).toBe('');
  expect(
    f.embed.mock.calls.some(
      ([texts, kind]) => kind === 'passage' && texts.includes(updated.text),
    ),
  ).toBe(true);
  const current = (await f.repo.embeddingPage(f.model.key, 'synthetic'))[0]!;
  await f.repo.forgetFact(updated.id, updated.version, true);
  await f.repo.saveEmbedding(
    current,
    f.model.key,
    current.contentHash!,
    current.vector!,
  );
  expect(
    (await f.db.client.execute('SELECT * FROM memory_embeddings')).rows,
  ).toHaveLength(0);
  expect(
    await f.service.retrieve(
      randomUUID(),
      'How do I take my coffee?',
      'synthetic',
    ),
  ).toBe('');
});

it('alcança fatos antigos fora dos 40 candidatos lexicais e mantém o orçamento de contexto', async () => {
  const f = await fixture();
  const old = await f.repo.createFact(
    input('Meu instrumento de observação é um refrator apocromático.'),
  );
  await f.db.client.execute({
    sql: 'UPDATE memory_facts SET updated_at = 1 WHERE id = ?',
    args: [old.id],
  });
  f.labels.set(old.text, 0);
  f.labels.set('Which telescope do I own?', 0);

  for (let i = 0; i < 55; i++) {
    await f.repo.createFact(input(`Configuração secundária número ${i}.`));
  }

  const search = createSemanticMemorySearch(f.repo, f.model);
  cleanup.push(() => search.close());

  for (let i = 0; i < 4; i++) {
    await search.index('synthetic');
  }

  const context = await f.service.retrieve(
    randomUUID(),
    'Which telescope do I own?',
    'synthetic',
  );
  expect(context).toContain(old.text);
  expect(JSON.stringify(JSON.parse(context).facts).length).toBeLessThanOrEqual(
    MEMORY_CONTEXT_CHARACTERS,
  );
  expect(
    (
      await f.db.client.execute(
        'SELECT COUNT(*) AS count FROM memory_embeddings',
      )
    ).rows[0]!.count,
  ).toBe(56);
});

it('reconstrói cache inválido ou de outro modelo e não usa similaridade baixa como evidência', async () => {
  const f = await fixture();
  const fact = await f.repo.createFact(input('Tenho um telescópio refrator.'));
  f.labels.set(fact.text, 0);
  f.labels.set('Pergunta inteiramente diferente', 1);
  const document = (await f.repo.embeddingPage(f.model.key, 'synthetic'))[0]!;
  const hash = createHash('sha256')
    .update(embeddingText(document))
    .digest('hex');
  await f.repo.saveEmbedding(document, 'older-model', hash, vector(0));
  expect(
    await f.service.retrieve(
      randomUUID(),
      'Pergunta inteiramente diferente',
      'synthetic',
    ),
  ).toBe('');
  expect(
    f.embed.mock.calls.filter(([, kind]) => kind === 'passage'),
  ).toHaveLength(1);
  await f.db.client.execute({
    sql: 'UPDATE memory_embeddings SET vector = ?',
    args: ['[1,2,3]'],
  });
  await f.service.retrieve(
    randomUUID(),
    'Pergunta inteiramente diferente',
    'synthetic',
  );
  expect(
    f.embed.mock.calls.filter(([, kind]) => kind === 'passage'),
  ).toHaveLength(2);
});

it('mantém a busca lexical e informa degradação quando o modelo local falha', async () => {
  const f = await fixture();
  const fact = await f.repo.createFact(input('Prefiro café sem açúcar.'));
  f.embed.mockRejectedValue(new Error('Cache ausente.'));
  expect(await f.service.retrieve(randomUUID(), 'café', 'synthetic')).toContain(
    fact.text,
  );
  expect((await f.service.status()).search).toMatchObject({
    state: 'degraded',
    lastError: 'LOCAL_MODEL_UNAVAILABLE',
  });
  await f.service.retrieve(randomUUID(), 'café', 'synthetic');
  expect(f.embed).toHaveBeenCalledTimes(1);
  expect(f.execute).not.toHaveBeenCalled();
});

it('classifica candidatos por relevância antes do contexto, sem enviar memórias privadas ao classificador', async () => {
  const rank = vi.fn<MemoryReranker['rank']>(async (_query, documents) =>
    documents.map((text) => (text.includes('hosted') ? 0.9 : 0.01)),
  );
  const f = await fixture({ key: 'test-ranker', rank, close: async () => {} });
  const specific = await f.repo.createFact(
    input('Project Aurora is hosted on a local server.'),
  );
  const generic = await f.repo.createFact(
    input('Project Aurora involves interface design.'),
  );
  const privateFact = await f.repo.createFact(
    input('Private project is hosted elsewhere.', { permission: 'local-only' }),
  );

  for (const fact of [specific, generic, privateFact]) {
    f.labels.set(fact.text, 0);
  }

  f.labels.set('Where is Aurora deployed?', 0);
  const context = await f.service.retrieve(
    randomUUID(),
    'Where is Aurora deployed?',
    'synthetic',
  );
  expect(context).toContain(specific.text);
  expect(context).not.toContain(generic.text);
  expect(rank.mock.calls[0]![1]).not.toContain(privateFact.text);
  expect((await f.service.status()).ranking).toMatchObject({ state: 'ready' });
});

it('usa as falas anteriores para resolver referências em outro idioma sem inventar áudio ouvido', async () => {
  const f = await fixture();
  const fact = await f.repo.createFact(
    input('Aurora was built by four students.'),
  );
  const contextual = 'Tell me about Aurora.\nHow many people were involved?';
  f.labels.set(fact.text, 0);
  f.labels.set(contextual, 0);
  const result = await f.service.retrieve(
    randomUUID(),
    'How many people were involved?',
    'synthetic',
    [{ user: 'Tell me about Aurora.', assistantConfirmed: '' }],
  );
  expect(result).toContain(fact.text);
  expect(f.embed).toHaveBeenCalledWith(
    ['How many people were involved?', contextual],
    'query',
  );
});

it('mantém a busca semântica e informa degradação quando o classificador falha', async () => {
  const rank = vi.fn<MemoryReranker['rank']>(async () => {
    throw new Error('Cache ausente.');
  });
  const f = await fixture({ key: 'test-ranker', rank, close: async () => {} });
  const fact = await f.repo.createFact(input('Cultivo cogumelos.'));
  f.labels.set(fact.text, 0);
  f.labels.set('What do I grow?', 0);
  expect(
    await f.service.retrieve(randomUUID(), 'What do I grow?', 'synthetic'),
  ).toContain(fact.text);
  expect((await f.service.status()).ranking).toMatchObject({
    state: 'degraded',
    lastError: 'LOCAL_RERANKER_UNAVAILABLE',
  });
  await f.service.retrieve(randomUUID(), 'What do I grow?', 'synthetic');
  expect(rank).toHaveBeenCalledOnce();
});

it('busca complementos confirmados pela mesma fonte sem revelar evidência nem memória privada', async () => {
  const rank = vi.fn<MemoryReranker['rank']>(async (_query, documents) =>
    documents.map(() => 0.9),
  );
  const f = await fixture({ key: 'test-ranker', rank, close: async () => {} });
  const conversation = await new SqliteConversationRepository(
    f.db.client,
  ).create('primary');
  const history = createSqliteCallHistory(f.db.client),
    sessionId = randomUUID(),
    turnId = randomUUID(),
    responseId = randomUUID();
  const speech =
    'Playlist Brisa é uma referência musical. Gosto de Aurora Boreal. Detalhe reservado.';
  await history.startSession({
    id: sessionId,
    conversationId: conversation.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await history.beginTurn({
    id: turnId,
    responseId,
    sessionId,
    conversationId: conversation.id,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await history.updateTurn(responseId, {
    userText: speech,
    status: 'completed',
  });
  const seed = await f.repo.createFact(
    input('Playlist Brisa é uma referência musical.'),
  );
  const complement = await f.repo.createFact(input('Gosto de Aurora Boreal.'));
  const privateFact = await f.repo.createFact(
    input('Detalhe reservado.', { permission: 'local-only' }),
  );

  for (const fact of [seed, complement, privateFact]) {
    await f.db.client.execute({
      sql: "UPDATE memory_facts SET origin = 'llm-extraction' WHERE id = ?",
      args: [fact.id],
    });
    await f.db.client.execute({
      sql: 'INSERT INTO memory_fact_sources VALUES (?, ?, ?)',
      args: [fact.id, turnId, speech],
    });
  }

  f.labels.set(seed.text, 0);
  f.labels.set(complement.text, 1);
  f.labels.set(privateFact.text, 0);
  f.labels.set('Tell me about Brisa', 0);
  const context = await f.service.retrieve(
    randomUUID(),
    'Tell me about Brisa',
    'synthetic',
  );
  expect(context).toContain(seed.text);
  expect(context).toContain(complement.text);
  expect(context).not.toContain(privateFact.text);
  expect(context).not.toContain(speech);
  expect(rank.mock.calls.flatMap(([, texts]) => texts)).not.toContain(
    privateFact.text,
  );
});

it('não reaproveita relevância de uma versão corrigida durante a classificação', async () => {
  let mutate = async () => {};

  const f = await fixture({
    key: 'test-ranker',
    rank: async () => {
      await mutate();

      return [0.9];
    },
    close: async () => {},
  });
  const fact = await f.repo.createFact(input('Aurora uses PostgreSQL.'));
  f.labels.set(fact.text, 0);
  f.labels.set('Which database does Aurora use?', 0);

  mutate = async () => {
    await f.repo.editFact(fact.id, fact.version, {
      ...input('Aurora now uses SQLite.'),
      status: 'confirmed',
    });
  };

  expect(
    await f.service.retrieve(
      randomUUID(),
      'Which database does Aurora use?',
      'synthetic',
    ),
  ).toBe('');
});

it('fornece ao extrator o fato anterior encontrado por significado para aplicar uma correção em outro idioma', async () => {
  const f = await fixture();
  const old = await f.repo.createFact(input('Prefiro café sem açúcar.'));
  const statement = 'I have changed my preference: now I sweeten my drink.';
  f.labels.set(old.text, 0);
  f.labels.set(statement, 0);
  const conversations = new SqliteConversationRepository(f.db.client);
  const conversation = await conversations.create('primary');
  const history = createSqliteCallHistory(f.db.client);
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const responseId = randomUUID();
  await history.startSession({
    id: sessionId,
    conversationId: conversation.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await history.beginTurn({
    id: turnId,
    responseId,
    sessionId,
    conversationId: conversation.id,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await history.updateTurn(responseId, {
    userText: statement,
    status: 'completed',
  });
  const policy = await f.service.policy();
  const { revision, ...settings } = policy;
  await f.service.configure({
    ...settings,
    expectedRevision: revision,
    acknowledgeLocalStorage: true,
    autoApprove: true,
  });
  f.execute.mockImplementation(async (_role, request) => {
    expect(JSON.parse(request.content).existingFacts).toContainEqual(
      expect.objectContaining({
        id: old.id,
        version: old.version,
        text: old.text,
      }),
    );

    return {
      content: JSON.stringify({
        facts: [
          {
            text: 'I now prefer my coffee sweetened.',
            category: 'preferencia',
            kind: 'correction',
            relation: null,
            supersedes: { factId: old.id, version: old.version },
            evidence: [{ turnId, quote: statement }],
          },
        ],
      }),
      inputTokens: 1,
      outputTokens: 1,
    };
  });
  await f.service.runOnce(Date.now() + 20000);
  expect(f.execute).toHaveBeenCalledOnce();
  expect(await f.repo.facts()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: old.id, status: 'superseded' }),
      expect.objectContaining({
        text: 'I now prefer my coffee sweetened.',
        status: 'confirmed',
        kind: 'correction',
      }),
    ]),
  );
});

it('não injeta uma memória editada durante a inferência usando o score da versão antiga', async () => {
  const f = await fixture();
  const fact = await f.repo.createFact(input('Tenho um telescópio refrator.'));
  f.labels.set(fact.text, 0);
  f.embed.mockImplementation(async (texts, kind) => {
    if (kind === 'query') {
      await f.repo.editFact(fact.id, fact.version, {
        ...input('Prefiro chá verde.'),
        status: 'confirmed',
      });
    }

    return texts.map(() => vector(0));
  });
  expect(
    await f.service.retrieve(
      randomUUID(),
      'Which telescope do I own?',
      'synthetic',
    ),
  ).toBe('');
});

it('interrompe a análise antes de chamar a LLM se chegar um turno durante a busca de fatos anteriores', async () => {
  const f = await fixture();
  await f.repo.createFact(input('Prefiro café sem açúcar.'));
  const conversation = await new SqliteConversationRepository(
    f.db.client,
  ).create('primary');
  const history = createSqliteCallHistory(f.db.client);
  const sessionId = randomUUID();
  const responseId = randomUUID();
  await history.startSession({
    id: sessionId,
    conversationId: conversation.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await history.beginTurn({
    id: randomUUID(),
    responseId,
    sessionId,
    conversationId: conversation.id,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await history.updateTurn(responseId, {
    userText: 'Agora adoço minha bebida.',
    status: 'completed',
  });
  f.embed.mockImplementation(async (texts, kind) => {
    if (kind === 'query') {
      f.service.interruptBackground();
    }

    return texts.map(() => vector(0));
  });
  await f.service.runOnce(Date.now() + 20000);
  expect(f.execute).not.toHaveBeenCalled();
  expect((await f.repo.jobs())[0]).toMatchObject({
    status: 'pending',
    attempts: 0,
    lastError: 'ACTIVE_CONVERSATION',
  });
});
