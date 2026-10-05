import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  parseMemoryExtraction,
  suggestLocally,
  summarizeSources,
} from '../../src/application/memory/extraction.ts';
import { selectRelevantFacts } from '../../src/application/memory/retrieval.ts';
import {
  FactSchema,
  type MemorySource,
} from '../../src/domain/memory/model.ts';

const source = (userText: string): MemorySource => ({
  id: randomUUID(),
  conversationId: randomUUID(),
  userText,
  assistantConfirmed: '',
  partiallyPlayed: false,
  responseStatus: 'completed',
  dataClass: 'synthetic',
});

it.each([
  [
    'Eu gosto de café sem açúcar, sabia?',
    'Eu gosto de café sem açúcar',
    'preferencia',
    'prefere',
    'café sem açúcar',
  ],
  [
    'Eu prefiro café sem açúcar, sabia?',
    'Eu prefiro café sem açúcar',
    'preferencia',
    'prefere',
    'café sem açúcar',
  ],
  ['  eu uso Linux, né?  ', 'eu uso Linux', 'contexto', 'usa', 'Linux'],
  [
    'Eu estou desenvolvendo Amadeus, viu!',
    'Eu estou desenvolvendo Amadeus',
    'projeto',
    'desenvolve',
    'Amadeus',
  ],
  ['Meu nome é Luís.', 'Meu nome é Luís.', 'identidade', 'chama_se', 'Luís'],
  ['Gosto de chá.', 'Gosto de chá.', 'preferencia', 'prefere', 'chá'],
])(
  'extrai uma declaração coloquial sem mudar a evidência: %s',
  (speech, text, category, predicate, object) => {
    const input = source(speech);
    expect(suggestLocally([input])).toEqual([
      {
        text,
        category,
        relation: { subject: 'usuário', predicate, object },
        evidence: [{ turnId: input.id, quote: speech.trim() }],
      },
    ]);
  },
);

it.each([
  'Eu não gosto de café.',
  'Eu gostaria de usar Linux.',
  'Você gosta de café?',
  'Eu gosto de café?',
  'Prefiro café sem açúcar?',
  'Eu gosto de café, por quê?',
  'Se eu prefiro café, não sei.',
  'Eu prefiro café neste exemplo fictício.',
])('não transforma perguntas, negações ou hipóteses em fatos: %s', (speech) => {
  expect(suggestLocally([source(speech)])).toEqual([]);
});

it('não extrai narrativas fictícias, falas do assistente nem sugestões sem evidência literal', () => {
  const sources = [
    source('Prefiro café.'),
    source('Meu nome é Pessoa Fictícia.'),
    { ...source('Oi.'), assistantConfirmed: 'Meu nome é Nome Inventado.' },
  ];
  expect(suggestLocally(sources).map((fact) => fact.text)).toEqual([
    'Prefiro café.',
  ]);
  expect(() =>
    parseMemoryExtraction(
      JSON.stringify({
        facts: [
          {
            text: 'Nome falso',
            category: 'identidade',
            relation: null,
            evidence: [{ turnId: sources[0]!.id, quote: 'Nome falso' }],
          },
        ],
      }),
      sources,
    ),
  ).toThrow();
  expect(() =>
    parseMemoryExtraction('```json\n{"facts":[]}\n```', sources),
  ).toThrow();
});

it('rejeita extração só do contexto antigo e alvo de correção desconhecido', () => {
  const old = source('Sempre tomo chá.');
  const current = source('Agora tomo café.');
  const content = (turnId: string, quote: string, supersedes: unknown = null) =>
    JSON.stringify({
      facts: [
        {
          text: 'Usuário toma café.',
          category: 'preferencia',
          relation: null,
          kind: 'correction',
          supersedes,
          evidence: [{ turnId, quote }],
        },
      ],
    });
  expect(() =>
    parseMemoryExtraction(
      content(old.id, old.userText),
      [old, current],
      [current],
    ),
  ).toThrow();
  expect(() =>
    parseMemoryExtraction(
      content(current.id, current.userText, {
        factId: randomUUID(),
        version: 1,
      }),
      [old, current],
      [current],
    ),
  ).toThrow();
  expect(() =>
    parseMemoryExtraction(
      content(current.id, 'Algo que só o assistente disse'),
      [old, current],
      [current],
    ),
  ).toThrow();
});

it('limita resumos e preserva marcação explícita de omissão e reprodução parcial', () => {
  const sources = Array.from({ length: 8 }, () => ({
    ...source('a'.repeat(4000)),
    assistantConfirmed: 'b'.repeat(3000),
    partiallyPlayed: true,
    responseStatus: 'interrupted',
  }));
  const summary = summarizeSources(sources);
  expect(summary.length).toBeLessThanOrEqual(3500);
  expect(JSON.parse(summary)[0]).toMatchObject({
    userTruncated: true,
    assistantTruncated: true,
    partiallyPlayed: true,
    responseStatus: 'interrupted',
  });
});

it('segue relações confirmadas sem atravessar uma relação privada e respeita o orçamento', () => {
  const fact = (
    text: string,
    subject: string,
    object: string,
    permission = 'eligible',
  ) =>
    FactSchema.parse({
      id: randomUUID(),
      text,
      category: 'projeto',
      status: 'confirmed',
      dataClass: 'synthetic',
      permission,
      version: 1,
      origin: 'user',
      createdAt: 0,
      updatedAt: 0,
      sources: [],
      relation: { subject, predicate: 'usa', object },
    });
  const first = fact('Amadeus usa Cartesia.', 'Amadeus', 'Cartesia');
  const privateBridge = fact(
    'Configuração reservada.',
    'Cartesia',
    'Segredo',
    'local-only',
  );
  const distant = fact('Informação distante.', 'Segredo', 'Outra entidade');
  const result = selectRelevantFacts(
    [first, privateBridge, distant],
    'Cartesia',
    'synthetic',
  );
  expect(result.map((entry) => entry.id)).toEqual([first.id]);
  const many = Array.from({ length: 100 }, (_, i) =>
    fact('Cartesia ' + i + ': ' + 'x'.repeat(550), 'Cartesia', 'Item ' + i),
  );
  expect(
    JSON.stringify(selectRelevantFacts(many, 'Cartesia', 'synthetic')).length,
  ).toBeLessThanOrEqual(1800);
  expect(selectRelevantFacts(many, 'assunto inexistente', 'synthetic')).toEqual(
    [],
  );
});
