import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  extractReviewedMemory,
  parseMemoryAnswer,
  planMemoryAnswer,
  reconcileReviewedMemory,
  verifyMemorySpeech,
} from '../../src/application/memory/review.ts';
import {
  FactSchema,
  type MemorySource,
} from '../../src/domain/memory/model.ts';
import type { ProviderServices } from '../../src/application/providers/index.ts';
import { memoryAnswerDirection } from '../../src/application/memory/context.ts';

const source: MemorySource = {
  id: randomUUID(),
  conversationId: randomUUID(),
  userText:
    'I mostly enjoy astronomy books, but I have not ranked their authors.',
  assistantConfirmed: '',
  responseStatus: 'completed',
  partiallyPlayed: false,
  dataClass: 'synthetic',
};

it('revisa vocativo como preferência separada e não o envia em avaliação sintética', async () => {
  const execute = vi.fn<ProviderServices['execute']>(async () =>
    output({ verdict: 'supported' }),
  );
  const providers = { execute };
  await verifyMemorySpeech(
    providers,
    JSON.stringify({ facts: [] }),
    'Olá.',
    'Oi, Alex.',
    'personal',
    new AbortController().signal,
    [],
    'Alex',
  );
  expect(
    JSON.parse(execute.mock.calls[0]![1].content).ownerAddress,
  ).toMatchObject({ preferredAddressName: 'Alex' });
  await verifyMemorySpeech(
    providers,
    JSON.stringify({ facts: [] }),
    'Olá.',
    'Oi.',
    'synthetic',
    new AbortController().signal,
    [],
    'Alex',
  );
  expect(JSON.parse(execute.mock.calls[1]![1].content)).not.toHaveProperty(
    'ownerAddress',
  );
});
const candidate = (text: string) => ({
  text,
  category: 'preferencia',
  kind: 'fact',
  relation: null,
  supersedes: null,
  evidence: [{ turnId: source.id, quote: source.userText }],
});
const output = (data: unknown) => ({
  content: JSON.stringify(data),
  inputTokens: 1,
  outputTokens: 1,
});
const reviewOutput = (data: { facts: object[] }) =>
  output({
    facts: data.facts.map((fact) => ({
      support: 'full',
      contextPreserved: true,
      context: null,
      sourceMode: 'asserted',
      ...fact,
    })),
  });
const old = FactSchema.parse({
  id: randomUUID(),
  version: 2,
  status: 'confirmed',
  origin: 'llm-extraction',
  createdAt: 1,
  updatedAt: 2,
  text: 'O usuário não tem escritor favorito.',
  category: 'preferencia',
  dataClass: 'synthetic',
  permission: 'eligible',
  sources: [],
});

it('guarda contexto livre junto da afirmação, sem regra por domínio ou idioma', async () => {
  const scopedSource = {
    ...source,
    userText:
      'Quando leio ficção científica, gosto principalmente de Ursula K. Le Guin.',
  };
  const fact = {
    ...candidate('O usuário gosta principalmente de Ursula K. Le Guin.'),
    evidence: [{ turnId: source.id, quote: scopedSource.userText }],
  };
  const execute = vi
    .fn<ProviderServices['execute']>()
    .mockResolvedValueOnce(output({ facts: [fact] }))
    .mockResolvedValueOnce(
      reviewOutput({
        facts: [{ ...fact, context: 'quando lê ficção científica' }],
      }),
    );
  const result = await extractReviewedMemory(
    { execute },
    [scopedSource],
    [],
    [],
    'synthetic',
    new AbortController().signal,
  );
  expect(result[0]!.text).toBe(
    'O usuário gosta principalmente de Ursula K. Le Guin. (quando lê ficção científica)',
  );
});

it('não aprova uma versão vaga que perdeu contexto, mesmo se seu conteúdo isolado for verdadeiro', async () => {
  const fact = candidate('Gosta de livros.');
  const execute = vi
    .fn<ProviderServices['execute']>()
    .mockResolvedValueOnce(output({ facts: [fact] }))
    .mockResolvedValueOnce(
      reviewOutput({ facts: [{ ...fact, contextPreserved: false }] }),
    );
  expect(
    await extractReviewedMemory(
      { execute },
      [source],
      [],
      [],
      'synthetic',
      new AbortController().signal,
    ),
  ).toEqual([]);
});

it('revê citações verdadeiras com significado falso antes de reconciliar e mantém os qualificadores', async () => {
  const faithful = candidate(
    'O usuário gosta principalmente de livros de astronomia e não declarou ranking de autores.',
  );
  const execute = vi
    .fn<ProviderServices['execute']>()
    .mockResolvedValueOnce(
      output({ facts: [candidate('O usuário não tem escritor favorito.')] }),
    )
    .mockResolvedValueOnce(reviewOutput({ facts: [faithful] }))
    .mockResolvedValueOnce(
      output({
        links: [
          {
            index: 0,
            supersedes: { factId: old.id, version: 2 },
            duplicateOf: null,
          },
        ],
      }),
    );
  const facts = await extractReviewedMemory(
    { execute },
    [source],
    [],
    [old],
    'synthetic',
    new AbortController().signal,
  );
  expect(execute.mock.calls.map((c) => c[1].memoryTask)).toEqual([
    'extract',
    'review',
    'reconcile',
  ]);

  for (const call of execute.mock.calls.slice(0, 2)) {
    expect(call[1].content).not.toContain(old.id);
  }

  const reconciliation = JSON.parse(execute.mock.calls[2]![1].content);
  expect(reconciliation.facts[0].text).toBe(faithful.text);
  expect(reconciliation.facts[0].text).not.toBe(old.text);
  expect(facts).toEqual([
    {
      ...faithful,
      kind: 'correction',
      supersedes: { factId: old.id, version: 2 },
    },
  ]);
});

it('não produz fatos se a revisão fica indisponível, e descarta ambiguidade inclusive com citação literal', async () => {
  const execute = vi
    .fn<ProviderServices['execute']>()
    .mockResolvedValueOnce(
      output({ facts: [candidate('Usuário tem um telescópio.')] }),
    )
    .mockRejectedValueOnce(new Error('Quota'));
  await expect(
    extractReviewedMemory(
      { execute },
      [source],
      [],
      [],
      'synthetic',
      new AbortController().signal,
    ),
  ).rejects.toThrow('Quota');
  execute
    .mockResolvedValueOnce(
      output({ facts: [candidate('Usuário tem um telescópio.')] }),
    )
    .mockResolvedValueOnce(output({ facts: [] }));
  expect(
    await extractReviewedMemory(
      { execute },
      [source],
      [],
      [],
      'synthetic',
      new AbortController().signal,
    ),
  ).toEqual([]);
});

it('revisão pode recuperar detalhes omitidos mesmo se o rascunho vier vazio', async () => {
  const execute = vi
    .fn<ProviderServices['execute']>()
    .mockResolvedValueOnce(output({ facts: [] }))
    .mockResolvedValueOnce(
      reviewOutput({
        facts: [
          candidate('O usuário gosta principalmente de livros de astronomia.'),
        ],
      }),
    );
  expect(
    await extractReviewedMemory(
      { execute },
      [source],
      [],
      [],
      'synthetic',
      new AbortController().signal,
    ),
  ).toHaveLength(1);
});

it('revalida evidência do revisor e não aceita detalhes copiados de uma fonte inexistente', async () => {
  const execute = vi
    .fn<ProviderServices['execute']>()
    .mockResolvedValueOnce(output({ facts: [] }))
    .mockResolvedValueOnce(
      reviewOutput({
        facts: [
          {
            ...candidate('Nome inventado'),
            evidence: [{ turnId: source.id, quote: 'Never said' }],
          },
        ],
      }),
    );
  await expect(
    extractReviewedMemory(
      { execute },
      [source],
      [],
      [],
      'synthetic',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});

it.each([
  ['partial', 'asserted'],
  ['none', 'asserted'],
  ['full', 'fictional'],
  ['full', 'hypothetical'],
  ['full', 'uncertain'],
])(
  'não aprova afirmação com suporte %s e modo %s mesmo tendo citação literal',
  async (support, sourceMode) => {
    const fact = candidate('Afirmação ambígua com citação existente.');
    const execute = vi
      .fn<ProviderServices['execute']>()
      .mockResolvedValueOnce(output({ facts: [fact] }))
      .mockResolvedValueOnce(
        output({
          facts: [
            {
              ...fact,
              support,
              contextPreserved: true,
              context: null,
              sourceMode,
            },
          ],
        }),
      );
    expect(
      await extractReviewedMemory(
        { execute },
        [source],
        [],
        [],
        'synthetic',
        new AbortController().signal,
      ),
    ).toEqual([]);
  },
);

it.each(
  [
    [
      {
        index: 0,
        supersedes: { factId: old.id, version: 1 },
        duplicateOf: null,
      },
    ],
    [
      {
        index: 0,
        supersedes: { factId: randomUUID(), version: 2 },
        duplicateOf: null,
      },
    ],
    [{ index: 4, supersedes: null, duplicateOf: null }],
    [
      { index: 0, supersedes: null, duplicateOf: null },
      { index: 0, supersedes: null, duplicateOf: null },
    ],
    [
      {
        index: 0,
        supersedes: { factId: old.id, version: 2 },
        duplicateOf: { factId: old.id, version: 2 },
      },
    ],
  ].map((links) => ({ links })),
)('rejeita alvo/versão/índice inválido: %j', ({ links }) => {
  expect(() =>
    reconcileReviewedMemory(
      JSON.stringify({ links }),
      [
        {
          ...candidate('Preferência nova'),
          category: 'preferencia',
          kind: 'fact',
        },
      ],
      [old],
    ),
  ).toThrow();
});

it('uma reconciliação não pode reescrever o fato e uma ligação ausente preserva detalhes novos', () => {
  const facts = [
    {
      ...candidate('Informação nova'),
      category: 'preferencia' as const,
      kind: 'fact' as const,
    },
  ];
  expect(reconcileReviewedMemory('{"links":[]}', facts, [old])).toEqual(facts);
  expect(() =>
    reconcileReviewedMemory(
      JSON.stringify({ links: [], facts: [candidate('Outro texto')] }),
      facts,
      [old],
    ),
  ).toThrow();
});

it('o plano usa apenas o recorte de fatos e mantém a separação entre personalidade e afirmações', async () => {
  const execute = vi.fn<ProviderServices['execute']>().mockResolvedValue(
    output({
      status: 'answerable',
      claims: [{ text: old.text, factIds: [old.id] }],
    }),
  );
  const result = await planMemoryAnswer(
    { execute },
    JSON.stringify({
      facts: [old],
      summaries: [{ content: 'Histórico privado' }],
      coMentioned: [],
    }),
    'Você lembra?',
    'synthetic',
    new AbortController().signal,
  );
  expect(result.status).toBe('answerable');
  expect(execute.mock.calls[0]![1].memoryTask).toBe('answer');
  expect(execute.mock.calls[0]![1].content).not.toContain('Histórico privado');
  expect(memoryAnswerDirection(result)).toContain('personalidade');
});

it.each([
  { status: 'answerable', claims: [] },
  { status: 'unknown', claims: [{ text: 'Algo', factIds: [old.id] }] },
  { status: 'answerable', claims: [{ text: 'Algo', factIds: [randomUUID()] }] },
])('rejeita plano inconsistente ou referência inventada: %j', (plan) => {
  expect(() => parseMemoryAnswer(JSON.stringify(plan), [old.id])).toThrow();
});

it('não envia memória pessoal em turno sintético nem memória local para provedor remoto', async () => {
  const execute = vi.fn<ProviderServices['execute']>();

  for (const [factClass, turnClass] of [
    ['personal', 'synthetic'],
    ['local-only', 'personal'],
  ] as const) {
    await expect(
      planMemoryAnswer(
        { execute },
        JSON.stringify({ facts: [{ ...old, dataClass: factClass }] }),
        'Question',
        turnClass,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  }

  expect(execute).not.toHaveBeenCalled();
});
