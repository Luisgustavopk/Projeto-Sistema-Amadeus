import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createMemoryRepository } from '../../src/adapters/database/memory-repository.ts';
import { backfillMemoryEquivalence } from '../../src/adapters/database/memory-equivalence-backfill.ts';
import { selectRelevantFacts } from '../../src/application/memory/retrieval.ts';
import { SqliteConversationRepository } from '../../src/adapters/database/conversation-repository.ts';
import { createSqliteCallHistory } from '../../src/adapters/database/call-history-repository.ts';
import { createMemoryService } from '../../src/application/memory/service.ts';
import {
  summarizeSources,
  suggestLocally,
} from '../../src/application/memory/extraction.ts';
import { QuotaExceededError } from '../../src/domain/errors/providers.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import {
  FactInputSchema,
  type MemorySource,
} from '../../src/domain/memory/model.ts';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) {
    await fn();
  }
});

async function fixture(url = 'file::memory:') {
  const db = await openDatabase(url);
  cleanup.push(() => db.client.close());
  const repo = createMemoryRepository(db.client, 'primary');
  const conversations = new SqliteConversationRepository(db.client);
  const conversation = await conversations.create('primary');
  const sessionId = randomUUID();
  const history = createSqliteCallHistory(db.client);
  await history.startSession({
    id: sessionId,
    conversationId: conversation.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  let index = 0;

  async function add(
    text: string,
    dataClass: MemorySource['dataClass'] = 'synthetic',
  ) {
    const id = randomUUID();
    const responseId = randomUUID();
    await history.beginTurn({
      id,
      responseId,
      sessionId,
      conversationId: conversation.id,
      clientTurnId: ++index,
      dataClass,
    });
    await history.updateTurn(responseId, {
      userText: text,
      generatedText: 'Resposta inteira gerada, não ouvida.',
      status: 'completed',
    });

    return { id, responseId };
  }

  const execute = vi.fn<ProviderServices['execute']>(async () => ({
    content: '{"facts":[]}',
    inputTokens: 1,
    outputTokens: 1,
  }));
  const service = createMemoryService(repo, { execute }, () => false);
  cleanup.push(() => service.stop());

  return {
    db,
    repo,
    history,
    conversation,
    sessionId,
    add,
    execute,
    service,
    conversations,
  };
}

const input = (text: string, overrides = {}) =>
  FactInputSchema.parse({
    text,
    category: 'preferencia',
    dataClass: 'synthetic',
    ...overrides,
  });

async function enableSemantic(f: Awaited<ReturnType<typeof fixture>>) {
  const policy = await f.repo.policy();
  await f.service.configure({
    expectedRevision: policy.revision,
    enabled: true,
    personalEnabled: false,
    extraction: 'llm',
    retentionDays: null,
  });
}

it.each(['synthetic', 'personal', 'local-only'] as const)(
  'aprova automaticamente fatos e checkpoints %s mantendo sua classificação',
  async (dataClass) => {
    const f = await fixture();
    expect((await f.service.policy()).autoApprove).toBe(false);
    await f.service.configure({
      expectedRevision: 0,
      enabled: true,
      personalEnabled: true,
      extraction: 'local',
      retentionDays: 30,
      acknowledgeLocalStorage: true,
      autoApprove: true,
    });
    await f.add('Eu gosto de café sem açúcar.', dataClass);
    await f.history.endSession(f.sessionId, 'closed');
    await f.service.runOnce();
    const facts = await f.repo.facts();
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      status: 'confirmed',
      permission: dataClass === 'local-only' ? 'local-only' : 'eligible',
      dataClass,
      origin: 'local-extraction',
    });
    expect((await f.repo.summaries())[0]!.permission).toBe(
      dataClass === 'local-only' ? 'local-only' : 'eligible',
    );
    expect(await f.service.retrieve(randomUUID(), 'café', dataClass)).toContain(
      facts[0]!.text,
    );

    if (dataClass !== 'synthetic') {
      expect(await f.service.retrieve(randomUUID(), 'café', 'synthetic')).toBe(
        '',
      );
    }

    if (dataClass === 'local-only') {
      expect(await f.service.retrieve(randomUUID(), 'café', 'personal')).toBe(
        '',
      );
    }

    await f.service.forget(facts[0]!.id, facts[0]!.version, false);
    await f.service.rebuild(f.conversation.id);
    await f.service.runOnce();
    expect(await f.repo.facts()).toEqual([]);
  },
);

it('conserva a opção em configurações antigas, permite desligar e não amplia permissões revisadas', async () => {
  const f = await fixture();
  const reviewed = await f.service.create(
    input('Eu gosto de café sem açúcar.'),
  );
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: false,
    extraction: 'local',
    retentionDays: null,
    autoApprove: true,
  });
  await f.service.configure({
    expectedRevision: 1,
    enabled: true,
    personalEnabled: false,
    extraction: 'local',
    retentionDays: null,
  });
  expect((await f.repo.policy()).autoApprove).toBe(true);
  await f.add('Eu gosto de café sem açúcar.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect((await f.repo.facts())[0]).toMatchObject({
    id: reviewed.id,
    permission: 'local-only',
    origin: 'user',
  });
  await f.service.configure({
    expectedRevision: 2,
    enabled: true,
    personalEnabled: false,
    extraction: 'local',
    retentionDays: null,
    autoApprove: false,
  });
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect((await f.repo.policy()).autoApprove).toBe(false);
  expect((await f.repo.facts())[0]!.permission).toBe('local-only');
});

it('aprova correções por LLM sem confirmação por ID e conserva a origem e o esquecimento', async () => {
  const f = await fixture();
  const old = await f.service.create(
    input('Usuário prefere chá.', {
      permission: 'eligible',
      relation: { subject: 'usuário', predicate: 'prefere', object: 'chá' },
    }),
  );
  const turn = await f.add('Agora prefiro café, não chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await enableSemantic(f);
  await f.service.configure({
    expectedRevision: 1,
    enabled: true,
    personalEnabled: false,
    extraction: 'llm',
    retentionDays: null,
    autoApprove: true,
  });
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário prefere café.',
          category: 'preferencia',
          relation: {
            subject: 'usuário',
            predicate: 'prefere',
            object: 'café',
          },
          kind: 'correction',
          supersedes: { factId: old.id, version: old.version },
          evidence: [
            { turnId: turn.id, quote: 'Agora prefiro café, não chá.' },
          ],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  const facts = await f.repo.facts();
  expect(facts.find((fact) => fact.id === old.id)?.status).toBe('superseded');
  const correction = facts.find((fact) => fact.kind === 'correction')!;
  expect(correction).toMatchObject({
    status: 'confirmed',
    permission: 'eligible',
    origin: 'llm-extraction',
  });
  expect((await f.service.graph()).edges.map((edge) => edge.target)).toEqual([
    'cafe',
  ]);
  expect(await f.service.retrieve(randomUUID(), 'café', 'synthetic')).toContain(
    correction.text,
  );
  expect(await f.service.retrieve(randomUUID(), 'chá', 'synthetic')).toBe('');
  await f.service.forget(correction.id, correction.version, false);
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect(
    (await f.repo.facts()).some((fact) => fact.status === 'confirmed'),
  ).toBe(false);
});

it('corrige uma memória aprovada automaticamente sem perder a origem ou restaurar a fonte anterior', async () => {
  const f = await fixture();
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: false,
    extraction: 'local',
    retentionDays: null,
    autoApprove: true,
  });
  await f.add('Eu prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  const old = (await f.repo.facts())[0]!;
  const next = await f.conversations.create('primary');
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const responseId = randomUUID();
  await f.history.startSession({
    id: sessionId,
    conversationId: next.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await f.history.beginTurn({
    id: turnId,
    responseId,
    sessionId,
    conversationId: next.id,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await f.history.updateTurn(responseId, {
    userText: 'Agora prefiro café, não chá.',
    status: 'completed',
  });
  await f.history.endSession(sessionId, 'closed');
  await f.service.configure({
    expectedRevision: 1,
    enabled: true,
    personalEnabled: false,
    extraction: 'llm',
    retentionDays: null,
  });
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário prefere café.',
          category: 'preferencia',
          kind: 'correction',
          relation: {
            subject: 'usuário',
            predicate: 'prefere',
            object: 'café',
          },
          supersedes: { factId: old.id, version: old.version },
          evidence: [{ turnId, quote: 'Agora prefiro café, não chá.' }],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  const facts = await f.repo.facts();
  expect(facts.find((fact) => fact.id === old.id)).toMatchObject({
    status: 'superseded',
    origin: 'local-extraction',
  });
  const correction = facts.find((fact) => fact.kind === 'correction')!;
  expect(correction).toMatchObject({
    status: 'confirmed',
    origin: 'llm-extraction',
    permission: 'eligible',
  });
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect(
    (await f.repo.facts()).some(
      (fact) => fact.text === old.text && fact.status === 'confirmed',
    ),
  ).toBe(false);
  await f.service.deleteConversation(next.id);
  expect((await f.repo.facts()).some((fact) => fact.id === correction.id)).toBe(
    false,
  );
});

it('rejeita evidência inventada também no modo automático', async () => {
  const f = await fixture();
  await enableSemantic(f);
  await f.service.configure({
    expectedRevision: 1,
    enabled: true,
    personalEnabled: false,
    extraction: 'llm',
    retentionDays: null,
    autoApprove: true,
  });
  const turn = await f.add('Imagine que eu gosto de chá em uma história.');
  await f.history.endSession(f.sessionId, 'closed');
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário prefere chá.',
          category: 'preferencia',
          relation: null,
          evidence: [{ turnId: turn.id, quote: 'Eu gosto de chá.' }],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  expect(await f.repo.facts()).toEqual([]);
  expect((await f.repo.jobs())[0]!.status).not.toBe('completed');
});

it('volta a sugerir novas memórias depois de desligar a aprovação automática', async () => {
  const f = await fixture();

  for (const autoApprove of [true, false]) {
    await f.service.configure({
      expectedRevision: (await f.repo.policy()).revision,
      enabled: true,
      personalEnabled: false,
      extraction: 'local',
      retentionDays: null,
      autoApprove,
    });
  }

  await f.add('Eu gosto de café sem açúcar.');
  await f.add('Imagine que eu prefiro chá em uma história.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect(await f.repo.facts()).toHaveLength(1);
  expect((await f.repo.facts())[0]).toMatchObject({
    status: 'suggested',
    permission: 'local-only',
  });
  expect((await f.repo.summaries())[0]!.permission).toBe('local-only');
  expect(await f.service.retrieve(randomUUID(), 'café', 'synthetic')).toBe('');
});

it('unifica preferências equivalentes e suas evidências sem promover sugestões', async () => {
  const f = await fixture();
  const first = await f.add('Eu gosto de café sem açúcar.');
  const second = await f.add('Eu prefiro café sem açúcar.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.repo.enqueue();
  const job = (await f.repo.claim(Date.now()))!;
  await f.repo.complete(
    job,
    [first, second].map((source, index) => ({
      text: index
        ? 'Eu prefiro café sem açúcar.'
        : 'Eu gosto de café sem açúcar.',
      category: 'preferencia',
      kind: 'fact',
      relation: {
        subject: index ? 'usuário' : 'eu',
        predicate: 'prefere',
        object: 'café sem açúcar',
      },
      evidence: [
        {
          turnId: source.id,
          quote: index
            ? 'Eu prefiro café sem açúcar.'
            : 'Eu gosto de café sem açúcar.',
        },
      ],
    })),
    '',
    'llm-extraction',
  );
  const facts = await f.repo.facts();
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    status: 'suggested',
    permission: 'local-only',
    relation: { subject: 'usuário' },
  });
  expect(facts[0]!.sources.map((s) => s.turnId).toSorted()).toEqual(
    [first.id, second.id].toSorted(),
  );
  expect(
    await f.service.retrieve(randomUUID(), 'Como gosto do café?', 'synthetic'),
  ).toBe('');
  const confirmed = await f.service.edit(facts[0]!.id, facts[0]!.version, {
    ...facts[0]!,
    status: 'confirmed',
    permission: 'eligible',
  });
  expect(
    await f.service.retrieve(randomUUID(), 'Como gosto do café?', 'synthetic'),
  ).toContain(confirmed.text);
  await f.service.forget(confirmed.id, confirmed.version, false);
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect(await f.repo.facts()).toEqual([]);
});

it('não funde negações, condições, pessoas, eventos ou classificações diferentes', async () => {
  const f = await fixture();
  const preference = {
    subject: 'eu',
    predicate: 'prefere',
    object: 'café sem açúcar',
  };

  for (const [text, overrides] of [
    ['Eu prefiro café sem açúcar.', {}],
    ['Eu não gosto de café sem açúcar.', {}],
    ['Eu prefiro café sem açúcar de manhã.', {}],
    [
      'Maho prefere café sem açúcar.',
      { relation: { ...preference, subject: 'Maho' } },
    ],
    [
      'Hoje prefiro café sem açúcar.',
      { kind: 'event', expiresAt: Date.now() + 86400000 },
    ],
    ['Eu gosto de café sem açúcar.', { dataClass: 'local-only' }],
  ] as const) {
    await f.repo.createFact(
      input(text, { relation: preference, ...overrides }),
    );
  }

  expect(await f.repo.facts()).toHaveLength(6);
  const unrelated = await f.repo.createFact(
    input('Eu prefiro jazz.', {
      permission: 'eligible',
      relation: { ...preference, object: 'jazz' },
    }),
  );
  expect(
    selectRelevantFacts(await f.repo.facts(), 'café', 'local-only').map(
      (f) => f.id,
    ),
  ).not.toContain(unrelated.id);
});

it('consolida registros antigos preservando confirmação, evidências e isolamento de permissões', async () => {
  const f = await fixture();
  const relation = {
    subject: 'eu',
    predicate: 'prefere',
    object: 'café sem açúcar',
  };
  const first = await f.repo.createFact(
    input('Eu prefiro café sem açúcar.', { relation, permission: 'eligible' }),
  );
  await f.db.client.execute('UPDATE memory_facts SET equivalence_key = NULL');
  const duplicate = await f.repo.createFact(
    input('Eu gosto de café sem açúcar.', { relation, permission: 'eligible' }),
  );
  const source = await f.add('Eu gosto de café sem açúcar.');
  await f.db.client.execute({
    sql: 'INSERT INTO memory_fact_sources VALUES (?, ?, ?)',
    args: [duplicate.id, source.id, 'Eu gosto de café sem açúcar.'],
  });
  await f.db.client.execute('UPDATE memory_facts SET equivalence_key = NULL');
  await backfillMemoryEquivalence(f.db.client);
  expect(await f.service.consolidate()).toEqual({ merged: 1, skipped: 0 });
  const facts = await f.repo.facts();
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    id: first.id,
    version: first.version + 1,
    status: 'confirmed',
    permission: 'eligible',
    relation: { subject: 'usuário' },
  });
  expect(facts[0]!.sources[0]!.turnId).toBe(source.id);
  expect(await f.service.consolidate()).toEqual({ merged: 0, skipped: 0 });
  await f.db.client.execute('UPDATE memory_facts SET equivalence_key = NULL');
  await f.repo.createFact(
    input('Usuário gosta de café sem açúcar.', {
      relation,
      permission: 'local-only',
    }),
  );
  await f.db.client.execute('UPDATE memory_facts SET equivalence_key = NULL');
  await backfillMemoryEquivalence(f.db.client);
  expect(await f.service.consolidate()).toEqual({ merged: 0, skipped: 1 });
  expect(await f.repo.facts()).toHaveLength(2);
});

it('usa contexto anterior para interpretar referências e exige evidência das falas novas', async () => {
  const f = await fixture();

  for (let i = 0; i < 7; i++) {
    await f.add('Conversa anterior ' + i + '.');
  }

  const antecedent = await f.add('O nome do meu projeto é Aurora.');
  await f.service.runOnce();
  const current = await f.add(
    'Esse projeto usa SQLite para guardar informações.',
  );
  await f.history.endSession(f.sessionId, 'closed');
  await enableSemantic(f);
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Projeto Aurora usa SQLite.',
          category: 'projeto',
          relation: { subject: 'Aurora', predicate: 'usa', object: 'SQLite' },
          kind: 'fact',
          supersedes: null,
          evidence: [
            { turnId: antecedent.id, quote: 'O nome do meu projeto é Aurora.' },
            {
              turnId: current.id,
              quote: 'Esse projeto usa SQLite para guardar informações.',
            },
          ],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  const payload = JSON.parse(f.execute.mock.calls[0]![1].content);
  expect(payload.previousSources).toHaveLength(6);
  expect(payload.previousSources.at(-1).turnId).toBe(antecedent.id);
  expect(payload.currentSources[0].turnId).toBe(current.id);
  const fact = (await f.repo.facts())[0]!;
  expect(fact).toMatchObject({
    text: 'Projeto Aurora usa SQLite.',
    status: 'suggested',
    kind: 'fact',
    origin: 'llm-extraction',
  });
  expect(fact.sources.map((s) => s.turnId).sort()).toEqual(
    [antecedent.id, current.id].sort(),
  );
});

it('expira acontecimentos temporários sem transformar a condição em fato permanente', async () => {
  const f = await fixture();
  const turn = await f.add('Estou cansado hoje.');
  await f.history.endSession(f.sessionId, 'closed');
  await enableSemantic(f);
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário relata cansaço hoje.',
          category: 'contexto',
          relation: null,
          kind: 'event',
          validForDays: 1,
          supersedes: null,
          evidence: [{ turnId: turn.id, quote: 'Estou cansado hoje.' }],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  const proposed = (await f.repo.facts())[0]!;
  expect(proposed.kind).toBe('event');
  expect(proposed.expiresAt).toBeGreaterThan(Date.now());
  await f.service.edit(proposed.id, proposed.version, {
    ...input(proposed.text, {
      kind: 'event',
      expiresAt: proposed.expiresAt,
      permission: 'eligible',
    }),
    status: 'confirmed',
  });
  expect(
    await f.service.retrieve(f.conversation.id, 'cansaço', 'synthetic'),
  ).toContain('event');
  const now = vi.spyOn(Date, 'now').mockReturnValue(proposed.expiresAt! + 1);

  try {
    expect(
      await f.service.retrieve(f.conversation.id, 'cansaço', 'synthetic'),
    ).toBe('');
    await f.repo.purgeExpired(Date.now());
    expect(await f.repo.facts()).toEqual([]);
    await f.service.rebuild(f.conversation.id);
    await f.service.runOnce();
    expect(await f.repo.facts()).toEqual([]);
  } finally {
    now.mockRestore();
  }
});

it('aplica uma correção vinculada somente após confirmação e remove a relação antiga da recuperação', async () => {
  const f = await fixture();
  const old = await f.service.create(
    input('Usuário prefere chá.', {
      permission: 'eligible',
      relation: { subject: 'usuário', predicate: 'prefere', object: 'chá' },
    }),
  );
  const turn = await f.add('Agora prefiro café, não chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await enableSemantic(f);
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário prefere café.',
          category: 'preferencia',
          relation: {
            subject: 'usuário',
            predicate: 'prefere',
            object: 'café',
          },
          kind: 'correction',
          supersedes: { factId: old.id, version: old.version },
          evidence: [
            { turnId: turn.id, quote: 'Agora prefiro café, não chá.' },
          ],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  const proposal = (await f.repo.facts()).find(
    (fact) => fact.kind === 'correction',
  )!;
  expect(
    (await f.repo.facts()).find((fact) => fact.id === old.id)?.status,
  ).toBe('confirmed');
  expect(proposal.status).toBe('suggested');
  await f.service.edit(proposal.id, proposal.version, {
    ...input(proposal.text, {
      permission: 'eligible',
      kind: 'correction',
      supersedes: proposal.supersedes,
      relation: proposal.relation,
    }),
    status: 'confirmed',
  });
  expect(
    (await f.repo.facts()).find((fact) => fact.id === old.id)?.status,
  ).toBe('superseded');
  expect((await f.service.graph()).edges.map((e) => e.target)).toEqual([
    'cafe',
  ]);
  expect(await f.service.retrieve(f.conversation.id, 'chá', 'synthetic')).toBe(
    '',
  );
  expect(
    await f.service.retrieve(f.conversation.id, 'café', 'synthetic'),
  ).toContain('Usuário prefere café.');
});

it('não aplica uma correção se a memória alvo mudou após a extração', async () => {
  const f = await fixture();
  const old = await f.service.create(
    input('Usuário prefere chá.', { permission: 'eligible' }),
  );
  const turn = await f.add('Agora prefiro café, não chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await enableSemantic(f);
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário prefere café.',
          category: 'preferencia',
          relation: null,
          kind: 'correction',
          supersedes: { factId: old.id, version: old.version },
          evidence: [
            { turnId: turn.id, quote: 'Agora prefiro café, não chá.' },
          ],
        },
      ],
    }),
    inputTokens: 10,
    outputTokens: 10,
  });
  await f.service.runOnce();
  const proposal = (await f.repo.facts()).find(
    (fact) => fact.kind === 'correction',
  )!;
  await f.service.edit(old.id, old.version, {
    ...input(old.text, { permission: 'eligible' }),
    status: 'confirmed',
  });
  await expect(
    f.service.edit(proposal.id, proposal.version, {
      ...input(proposal.text, {
        kind: 'correction',
        supersedes: proposal.supersedes,
      }),
      status: 'confirmed',
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_BUSY' });
});

it('processa uma preferência coloquial em conversa pessoal encerrada e mantém a sugestão para revisão', async () => {
  const f = await fixture();
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: true,
    extraction: 'local',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });
  const turn = await f.add('Eu gosto de café sem açúcar, sabia?', 'personal');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect(await f.repo.facts()).toEqual([
    expect.objectContaining({
      text: 'Eu gosto de café sem açúcar',
      status: 'suggested',
      dataClass: 'personal',
      permission: 'local-only',
      relation: {
        subject: 'usuário',
        predicate: 'prefere',
        object: 'café sem açúcar',
      },
      sources: [
        {
          turnId: turn.id,
          conversationId: f.conversation.id,
          evidence: 'Eu gosto de café sem açúcar, sabia?',
        },
      ],
    }),
  ]);
  expect(f.execute).not.toHaveBeenCalled();
  expect(
    await f.service.retrieve(randomUUID(), 'café açúcar', 'personal'),
  ).toBe('');
});

it('extrai sugestões locais, resume apenas áudio confirmado e não promove fatos automaticamente', async () => {
  const f = await fixture();
  const turn = await f.add('Prefiro café sem açúcar.');
  const segmentId = randomUUID();
  await f.history.addSegment({
    id: segmentId,
    responseId: turn.responseId,
    position: 0,
    text: 'Trecho realmente reproduzido.',
  });
  await f.history.setAudio(segmentId, 100);
  await f.history.acknowledge({
    sessionId: f.sessionId,
    responseId: turn.responseId,
    segmentId,
    playedSamples: 100,
  });
  await f.history.addSegment({
    id: randomUUID(),
    responseId: turn.responseId,
    position: 1,
    text: 'Não ouvido e não deve entrar no resumo.',
  });
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect(f.execute).not.toHaveBeenCalled();
  const facts = await f.repo.facts();
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    status: 'suggested',
    permission: 'local-only',
    origin: 'local-extraction',
    sources: [{ turnId: turn.id }],
  });
  const summaries = await f.repo.summaries();
  expect(summaries[0]!.content).toContain('Trecho realmente reproduzido');
  expect(summaries[0]!.content).not.toContain('Não ouvido');
  expect(
    await f.service.retrieve(randomUUID(), 'café açúcar', 'synthetic'),
  ).toBe('');
  const confirmed = await f.service.edit(facts[0]!.id, 1, {
    ...input(facts[0]!.text),
    relation: facts[0]!.relation,
    permission: 'eligible',
    status: 'confirmed',
  });
  expect(
    await f.service.retrieve(randomUUID(), 'café açúcar', 'synthetic'),
  ).toContain(confirmed.text);
  await f.service.runOnce();
  expect(await f.repo.facts()).toHaveLength(1);
  expect(await f.repo.jobs()).toHaveLength(1);
});

it('cria checkpoints de oito turnos e completa a cauda ao encerrar sem duplicação', async () => {
  const f = await fixture();

  for (let i = 0; i < 9; i++) {
    await f.add('Prefiro item ' + i + '.');
  }

  await f.repo.enqueue();
  expect(await f.repo.jobs()).toHaveLength(1);
  await f.service.runOnce();
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect(await f.repo.jobs()).toHaveLength(2);
  expect(await f.repo.facts()).toHaveLength(9);
});

it('bloqueia memória pessoal por padrão e mantém extrações sem chamada remota', async () => {
  const f = await fixture();
  await f.add('Meu nome é Pessoa Real.', 'personal');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect(f.execute).not.toHaveBeenCalled();
  expect(await f.repo.facts()).toEqual([]);
  expect((await f.repo.jobs())[0]).toMatchObject({
    status: 'pending',
    attempts: 0,
    lastError: 'DATA_POLICY_BLOCKED',
  });
  await expect(
    f.service.configure({
      expectedRevision: 0,
      enabled: true,
      personalEnabled: true,
      extraction: 'local',
      retentionDays: 30,
    }),
  ).rejects.toMatchObject({ code: 'DATA_POLICY_BLOCKED' });
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: true,
    extraction: 'local',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });
  await f.service.runOnce(Date.now() + 61000);
  expect((await f.repo.facts())[0]).toMatchObject({
    dataClass: 'personal',
    status: 'suggested',
    permission: 'local-only',
  });
});

it('respeita Retry-After sem esgotar tentativas e valida citações da extração LLM', async () => {
  const f = await fixture();
  const source = await f.add('Uso Cartesia.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: false,
    extraction: 'llm',
    retentionDays: null,
  });
  const quota = new QuotaExceededError();
  quota.retryAfterMs = 120000;
  f.execute.mockRejectedValueOnce(quota);
  const now = Date.now();
  await f.service.runOnce(now);
  expect((await f.repo.jobs())[0]).toMatchObject({
    nextRun: now + 120000,
    attempts: 0,
    status: 'pending',
  });
  await f.service.runOnce(now + 119999);
  expect(f.execute).toHaveBeenCalledTimes(1);
  f.execute.mockResolvedValueOnce({
    content: JSON.stringify({
      facts: [
        {
          text: 'Usuário usa Cartesia.',
          category: 'contexto',
          relation: null,
          evidence: [{ turnId: source.id, quote: 'Uso Cartesia.' }],
        },
      ],
    }),
    inputTokens: 1,
    outputTokens: 1,
  });
  await f.service.runOnce(now + 120001);
  expect((await f.repo.facts())[0]).toMatchObject({
    status: 'suggested',
    origin: 'llm-extraction',
  });
  expect(f.execute.mock.calls[1]![1]).toMatchObject({
    dataClass: 'synthetic',
    maxTokens: 4096,
  });
});

it('limita cinco falhas inválidas e não aceita evidência inventada', async () => {
  const f = await fixture();
  await f.add('Uso Cartesia.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: false,
    extraction: 'llm',
    retentionDays: null,
  });
  f.execute.mockResolvedValue({
    content: JSON.stringify({
      facts: [
        {
          text: 'Fato falso',
          category: 'contexto',
          relation: null,
          evidence: [{ turnId: randomUUID(), quote: 'Nunca declarado' }],
        },
      ],
    }),
    inputTokens: 1,
    outputTokens: 1,
  });

  for (let i = 0; i < 6; i++) {
    await f.service.runOnce(Date.now() + i * 3600001);
  }

  expect(f.execute).toHaveBeenCalledTimes(5);
  expect(await f.repo.facts()).toEqual([]);
  expect((await f.repo.jobs())[0]).toMatchObject({
    status: 'failed',
    attempts: 5,
    lastError: 'PROVIDER_INVALID',
  });
});

it('corrige texto e grafo, invalida derivados e evita restaurar o dado antigo na reconstrução', async () => {
  const f = await fixture();
  await f.add('Prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  const previous = (await f.repo.facts())[0]!;
  const corrected = await f.service.edit(previous.id, 1, {
    ...input('Prefiro café.'),
    relation: { subject: 'usuário', predicate: 'prefere', object: 'café' },
    status: 'confirmed',
    permission: 'eligible',
  });
  expect(corrected.version).toBe(2);
  expect(await f.repo.summaries()).toEqual([]);
  expect(await f.history.recent(f.conversation.id, 'primary', 12)).toEqual([]);
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect((await f.repo.facts()).map((fact) => fact.text)).toEqual([
    'Prefiro café.',
  ]);
  const exported = JSON.stringify(await f.repo.exportData());
  expect(exported).not.toContain('"label":"chá"');
  await expect(
    f.service.edit(previous.id, 1, {
      ...input('Outra edição'),
      status: 'confirmed',
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_BUSY' });
});

it('esquece uma fonte sem apagar histórico por padrão e redige tudo quando solicitado', async () => {
  const f = await fixture();
  await f.add('Prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  const fact = (await f.repo.facts())[0]!;
  expect(await f.service.forget(fact.id, fact.version, false)).toEqual({
    originalHistoryRetained: true,
  });
  expect(
    (await f.repo.conversation(f.conversation.id)).turns[0]!.userText,
  ).toContain('chá');
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect(await f.repo.facts()).toEqual([]);
  expect(await f.repo.summaries()).toEqual([]);

  const other = await fixture();
  await other.add('Prefiro café.');
  await other.history.endSession(other.sessionId, 'closed');
  await other.service.runOnce();
  const erased = (await other.repo.facts())[0]!;
  expect(await other.service.forget(erased.id, erased.version, true)).toEqual({
    originalHistoryRetained: false,
  });
  expect(JSON.stringify(await other.repo.exportData())).not.toContain(
    'Prefiro café',
  );
});

it('rejeita conclusão antiga depois de uma exclusão e recupera trabalho em execução', async () => {
  const f = await fixture();
  await f.add('Prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.repo.enqueue();
  const job = (await f.repo.claim(Date.now()))!;
  const manual = await f.repo.createFact(input('Prefiro chá.'));
  await f.repo.forgetFact(manual.id, manual.version, false);
  expect(
    await f.repo.complete(
      job,
      suggestLocally(job.sources),
      summarizeSources(job.sources),
      'local-extraction',
    ),
  ).toBe(false);
  await f.repo.claim(Date.now());
  await f.repo.recover();
  expect((await f.repo.jobs())[0]!.status).toBe('pending');
  await f.service.runOnce();
  expect(await f.repo.facts()).toEqual([]);
});

it('preserva isolamento, evita dados pessoais em contexto sintético e limita o grafo', async () => {
  const f = await fixture();
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: true,
    extraction: 'local',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });
  await f.service.create(
    input('Amadeus utiliza Cartesia.', {
      category: 'projeto',
      permission: 'eligible',
      relation: { subject: 'Amadeus', predicate: 'usa', object: 'Cartesia' },
    }),
  );
  await f.service.create(
    input('O clone vocal confirmado pertence ao serviço.', {
      permission: 'eligible',
      relation: {
        subject: 'Cartesia',
        predicate: 'usa',
        object: 'Clone aprovado',
      },
    }),
  );
  await f.service.create(
    input('Cartesia: informação privada.', {
      dataClass: 'personal',
      permission: 'local-only',
    }),
  );
  await f.service.create(
    input('Cartesia: informação pessoal elegível.', {
      dataClass: 'personal',
      permission: 'eligible',
    }),
  );
  const recovered = await f.service.retrieve(
    randomUUID(),
    'Qual Cartesia?',
    'synthetic',
  );
  expect(recovered).toContain('Clone aprovado');
  expect(recovered).not.toContain('informação privada');
  expect(recovered).not.toContain('informação pessoal');
  expect(
    await f.service.retrieve(randomUUID(), 'Cartesia', 'personal'),
  ).toContain('informação pessoal elegível');
  expect(
    await f.service.retrieve(randomUUID(), 'Cartesia', 'local-only'),
  ).toContain('informação privada');
  const other = createMemoryRepository(f.db.client, 'other');
  expect(await other.facts()).toEqual([]);
  await expect(other.conversation(f.conversation.id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(JSON.stringify(await other.exportData())).not.toContain('Cartesia');
  expect(recovered.length).toBeLessThanOrEqual(3050);
});

it('exclui conversas e derivados e preserva manualmente fatos de outras fontes', async () => {
  const f = await fixture();
  await f.add('Uso Cartesia.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  await f.repo.createFact(input('Preferência explícita independente.'));
  await f.service.deleteConversation(f.conversation.id);
  expect((await f.repo.facts()).map((fact) => fact.text)).toEqual([
    'Preferência explícita independente.',
  ]);
  expect(await f.repo.jobs()).toEqual([]);
  expect(await f.repo.summaries()).toEqual([]);
  await expect(f.repo.conversation(f.conversation.id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});

it('mantém dados sem retenção ativada e aplica retenção apenas depois da escolha explícita', async () => {
  const f = await fixture();
  await f.add('Prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.repo.purgeExpired(Date.now() + 40 * 86400000);
  expect(await f.repo.listConversations()).toHaveLength(1);
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: false,
    extraction: 'local',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });
  await f.repo.purgeExpired(Date.now() + 40 * 86400000);
  expect(await f.repo.listConversations()).toHaveLength(0);
});

it('restaura backup frio com fatos, tarefas e bloqueio de reextração preservados', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amadeus-memory-restore-'));
  cleanup.push(() =>
    rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  );
  const original = join(root, 'original.db');
  const backup = join(root, 'backup.db');
  const f = await fixture();
  await f.add('Prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  const fact = (await f.repo.facts())[0]!;
  await f.service.forget(fact.id, 1, false);
  await f.repo.createFact(input('Uso Cartesia.'));
  await f.service.stop();
  await f.db.client.execute({ sql: 'VACUUM INTO ?', args: [original] });
  f.db.client.close();
  await copyFile(original, backup);
  const script = `
    import { openDatabase } from ${JSON.stringify(new URL('../../src/adapters/database/index.ts', import.meta.url).href)};
    import { createMemoryRepository } from ${JSON.stringify(new URL('../../src/adapters/database/memory-repository.ts', import.meta.url).href)};
    import { createMemoryService } from ${JSON.stringify(new URL('../../src/application/memory/service.ts', import.meta.url).href)};
    const db = await openDatabase('file:' + process.argv[1]);
    const repo = createMemoryRepository(db.client, 'primary');
    const before = (await repo.facts()).map(f => f.text);
    await repo.rebuild(process.argv[2]);
    const service = createMemoryService(repo, { execute: async () => { throw Error('Unexpected inference'); } }, () => false);
    await service.runOnce();
    console.log(JSON.stringify({ before, after: (await repo.facts()).map(f => f.text) }));
    await service.stop();
    db.client.close();
  `;
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script, backup, f.conversation.id],
      { encoding: 'utf8', timeout: 10000 },
    ),
  );
  expect(result).toEqual({
    before: ['Uso Cartesia.'],
    after: ['Uso Cartesia.'],
  });
});

it('recompõe resumos após reprodução tardia e não reprocessa confirmação duplicada', async () => {
  const f = await fixture();
  const turn = await f.add('Uso Cartesia.');
  const segmentId = randomUUID();
  await f.history.addSegment({
    id: segmentId,
    responseId: turn.responseId,
    position: 0,
    text: 'Trecho confirmado depois.',
  });
  await f.history.setAudio(segmentId, 100);
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  expect((await f.repo.summaries())[0]!.content).not.toContain(
    'Trecho confirmado depois.',
  );
  const ack = {
    sessionId: f.sessionId,
    responseId: turn.responseId,
    segmentId,
    playedSamples: 100,
  };
  await f.history.acknowledge(ack);
  expect(await f.repo.summaries()).toEqual([]);
  await f.service.runOnce();
  expect((await f.repo.summaries())[0]!.content).toContain(
    'Trecho confirmado depois.',
  );
  await f.history.acknowledge(ack);
  expect((await f.repo.jobs())[0]!.status).toBe('completed');
  expect(await f.repo.facts()).toHaveLength(1);
});

it('revisa fatos com fontes sobreviventes quando uma conversa é excluída', async () => {
  const f = await fixture();
  await f.add('Uso Cartesia.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  const other = await f.conversations.create('primary');
  const sessionId = randomUUID();
  const responseId = randomUUID();
  await f.history.startSession({
    id: sessionId,
    conversationId: other.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await f.history.beginTurn({
    id: randomUUID(),
    responseId,
    sessionId,
    conversationId: other.id,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await f.history.updateTurn(responseId, {
    userText: 'Uso Cartesia.',
    status: 'completed',
  });
  await f.history.endSession(sessionId, 'closed');
  await f.service.runOnce();
  const fact = (await f.repo.facts())[0]!;
  expect(fact.sources).toHaveLength(2);
  await f.repo.editFact(fact.id, 1, {
    ...input(fact.text),
    relation: fact.relation,
    status: 'confirmed',
    permission: 'eligible',
  });
  await f.repo.deleteConversation(f.conversation.id);
  const remaining = (await f.repo.facts())[0]!;
  expect(remaining.status).toBe('suggested');
  expect(remaining.sources).toHaveLength(1);
  expect(remaining.sources[0]!.conversationId).toBe(other.id);
});

it('somente recupera checkpoints autorizados e pausa mutações durante um turno', async () => {
  const f = await fixture();
  await f.add('Uso Cartesia.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  const summary = (await f.repo.summaries())[0]!;
  expect(
    await f.service.retrieve(f.conversation.id, 'Cartesia', 'synthetic'),
  ).toBe('');
  await f.service.permitSummary(summary.id, 1, 'eligible');
  expect(
    await f.service.retrieve(f.conversation.id, 'Cartesia', 'synthetic'),
  ).toContain('Uso Cartesia.');
  expect(
    await f.service.retrieve(
      f.conversation.id,
      'assunto inexistente',
      'synthetic',
    ),
  ).toBe('');
  const busy = createMemoryService(f.repo, { execute: f.execute }, () => true);
  await expect(busy.create(input('Novo fato.'))).rejects.toMatchObject({
    code: 'PROVIDER_BUSY',
  });
  await busy.runOnce();
  expect(f.execute).not.toHaveBeenCalled();
});

it('valida o vínculo da retomada sem confiar no identificador de outro proprietário ou conversa', async () => {
  const f = await fixture();
  await expect(
    f.history.validateResume!(f.sessionId, f.conversation.id, 'other'),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    f.history.validateResume!(f.sessionId, randomUUID(), 'primary'),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    f.history.validateResume!(f.sessionId, f.conversation.id, 'primary'),
  ).resolves.toBeUndefined();
});

it('não reextrai um fato vencido de uma conversa ainda retida', async () => {
  const f = await fixture();
  await f.add('Prefiro chá.');
  await f.history.endSession(f.sessionId, 'closed');
  await f.service.runOnce();
  await f.service.configure({
    expectedRevision: 0,
    enabled: true,
    personalEnabled: false,
    extraction: 'local',
    retentionDays: 30,
    acknowledgeLocalStorage: true,
  });
  await f.db.client.execute({
    sql: 'UPDATE memory_facts SET updated_at = ?',
    args: [Date.now() - 40 * 86400000],
  });
  await f.repo.purgeExpired(Date.now());
  expect(await f.repo.listConversations()).toHaveLength(1);
  expect(await f.repo.facts()).toEqual([]);
  await f.service.rebuild(f.conversation.id);
  await f.service.runOnce();
  expect(await f.repo.facts()).toEqual([]);
  expect(await f.repo.summaries()).toEqual([]);
});
