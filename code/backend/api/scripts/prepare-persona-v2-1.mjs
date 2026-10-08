import { readFile, writeFile } from 'node:fs/promises';
import { loadPersonaReferenceCatalog } from '../src/application/persona/reference-catalog.ts';
import {
  contamination,
  fingerprint,
} from '../src/evaluation/persona/diagnostics.ts';
import { ExpressionSchema } from '../src/domain/persona/expression.ts';
import {
  corpusStyleProfile,
  sourceDigest,
} from '../src/evaluation/persona/corpus-profile.ts';

const root = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const old = new URL('../../evals/persona/quality-v2/', import.meta.url);
const external = new URL(
  '../../assets/persona/external/francesco-amadeus/',
  import.meta.url,
);
const prepared = (
  await readFile(new URL('prepared/dialogues.jsonl', external), 'utf8')
)
  .trim()
  .split(/\r?\n/u)
  .map(JSON.parse);
const normalizeCases = (value) => (Array.isArray(value) ? value : value?.value);
const scenarios = (
  await Promise.all(
    ['development', 'heldout', 'regression', 'memory', 'initiative'].map(
      async (file) =>
        normalizeCases(
          JSON.parse(
            (await readFile(new URL(file + '.json', old), 'utf8')).replace(
              /^\uFEFF/u,
              '',
            ),
          ).cases,
        ),
    ),
  )
).flat();
const catalog = await loadPersonaReferenceCatalog(false);
const priority = [
  'estilo-saudacao',
  'estilo-elogio-direto',
  'estilo-discordancia',
  'estilo-escuta',
  'estilo-apelido',
  'estilo-reparo',
  'estilo-evidencia',
  'estilo-limite',
  'estilo-afeto',
  'estilo-simplicidade',
  'estilo-revisao',
  'estilo-rotulo',
  'estilo-alivio',
  'estilo-linguagem',
  'estilo-razao',
  'estilo-reconciliar',
  'estilo-sintese',
];
const ordered = [
  ...priority.map((id) => catalog.find((e) => e.id === id)),
  ...catalog.filter((e) => e.kind === 'style' && !priority.includes(e.id)),
];
const shots = [],
  rejected = [];
const expressions = {
  'estilo-saudacao': ['conversar', 'calor_discreto'],
  'estilo-elogio-direto': ['agradecer', 'constrangimento_leve'],
  'estilo-discordancia': ['discordar', 'firmeza_calma'],
  'estilo-escuta': ['acolher', 'preocupacao'],
  'estilo-apelido': ['provocacao_afetuosa', 'ironia_leve'],
  'estilo-reparo': ['corrigir_se', 'autocritica_leve'],
  'estilo-evidencia': ['explorar', 'curiosidade'],
  'estilo-limite': ['admitir_limite', 'neutra'],
  'estilo-afeto': ['agradecer', 'calor_discreto'],
  'estilo-simplicidade': ['compartilhar', 'firmeza_calma'],
};
for (const entry of ordered) {
  if (!entry || entry.kind !== 'style' || shots.length === 17) continue;
  const overlap = contamination(
    scenarios,
    entry.dialogue.map((m) => m.content),
  );
  if (overlap.length) {
    rejected.push({
      id: entry.id,
      reason: 'literal-overlap',
      cases: overlap.map((o) => o.id),
    });
    continue;
  }
  for (const source of entry.provenance) {
    const record = prepared.find((r) => r.id === source.sourceId);
    const original = await readFile(
      new URL('source/' + source.file, external),
      'utf8',
    );
    const excerpt = original
      .replace(/\r\n?/gu, '\n')
      .split('\n')
      .slice(source.lineStart - 1, source.lineEnd)
      .join('\n')
      .trim();
    if (
      !record ||
      sourceDigest(original) !== source.sourceHash ||
      record.target.speaker !== 'Kurisu' ||
      !excerpt.startsWith('Kurisu:') ||
      excerpt.replace(/^Kurisu:\s*/u, '') !== record.target.text.trim()
    )
      throw new Error('Autoria/contexto inválido: ' + entry.id);
  }
  const [intent, emotion] = expressions[entry.id] ?? ['conversar', 'neutra'];
  const expression = ExpressionSchema.parse({
    intent,
    emotion,
    intensity: emotion === 'neutra' ? 0.15 : 0.3,
  });
  shots.push({
    id: entry.id,
    kind: 'style-adaptation',
    situation: entry.situation,
    sourceIds: entry.provenance.map((p) => p.sourceId),
    provenance: entry.provenance,
    sceneContext: entry.sceneContext,
    adaptationNote: entry.adaptationNote,
    facts: [],
    messages: entry.dialogue.map((m) => ({
      ...m,
      content:
        m.role === 'assistant'
          ? '<expression>' +
            JSON.stringify({ memory: [], ...expression }) +
            '</expression>' +
            m.content
          : m.content,
    })),
  });
}
if (shots.length !== 17) throw new Error('Faltam 17 exemplos disjuntos.');
shots.push(
  {
    id: 'contrato-bebida',
    kind: 'synthetic-memory-contract',
    sourceIds: [],
    provenance: [],
    sceneContext:
      'Demonstração sintética do contrato de memória, não evidência canônica.',
    adaptationNote: 'Recordar um fato disponível pelo índice correto.',
    facts: ['A participante prefere chá de hibisco gelado.'],
    messages: [
      { role: 'user', content: 'Qual bebida eu prefiro?' },
      {
        role: 'assistant',
        content:
          '<expression>{"memory":[0],"intent":"retomar","emotion":"neutra","intensity":0.15}</expression>Chá de hibisco gelado.',
      },
    ],
  },
  {
    id: 'contrato-sugestao',
    kind: 'synthetic-memory-contract',
    sourceIds: [],
    provenance: [],
    sceneContext:
      'Demonstração sintética do contrato de memória, não evidência canônica.',
    adaptationNote:
      'Usar gosto como critério de proposta nova, sem afirmar consumo anterior.',
    facts: ['A participante gosta de desenhar fachadas antigas.'],
    messages: [
      { role: 'user', content: 'Me sugere um exercício criativo diferente.' },
      {
        role: 'assistant',
        content:
          '<expression>{"memory":{"use":"context","facts":[0]},"intent":"compartilhar","emotion":"curiosidade","intensity":0.3}</expression>Desenhar a mesma fachada em três horários pode render um estudo interessante de luz.',
      },
    ],
  },
);
const overlap = contamination(
  scenarios,
  shots.flatMap((s) => s.messages.map((m) => m.content)),
);
if (overlap.length) throw new Error('Exemplos sobrepõem cenários congelados.');
const bank = {
  version: 1,
  curatedBy: 'editorial-adaptation-unvalidated-by-user',
  sourceCatalogHash: fingerprint(catalog),
  chronology: 'style-only; memories are synthetic',
  levels: {
    1: [...shots.slice(0, 10), ...shots.slice(-2)].map((s) => s.id),
    2: shots.map((s) => s.id),
  },
  shots,
  rejected,
  limitations: [
    'Autoria e trechos conferidos; adequação da adaptação depende de avaliação humana.',
    'Sobreposição literal ausente não certifica independência semântica.',
    'D1 limita autobiografia; cenas posteriores fornecem apenas função de reação.',
  ],
};
await writeFile(
  new URL('shots.json', root),
  JSON.stringify(bank, null, 2) + '\n',
);
await writeFile(
  new URL('curation-audit.json', root),
  JSON.stringify(
    {
      version: 1,
      sourceCatalogHash: bank.sourceCatalogHash,
      examinedSources: shots.filter((s) => s.kind === 'style-adaptation')
        .length,
      selected: shots.map((s) => ({
        id: s.id,
        kind: s.kind,
        sourceIds: s.sourceIds,
        situation: s.situation ?? 'Contrato sintético de memória',
        sourceProfile:
          s.kind === 'style-adaptation'
            ? corpusStyleProfile(
                s.sourceIds.map(
                  (id) => prepared.find((r) => r.id === id).target.text,
                ),
                'en',
              )
            : null,
        adaptationProfile: corpusStyleProfile(
          s.messages
            .filter((m) => m.role === 'assistant')
            .map((m) =>
              m.content.replace(/^<expression>.*?<\/expression>/su, ''),
            ),
          'pt-BR',
        ),
        attributionChecked: s.kind === 'style-adaptation',
        contextAvailable: s.kind === 'style-adaptation',
        autobiographicalEligible: false,
      })),
      rejected,
      literalOverlap: overlap,
      humanAccepted: false,
      paidCalls: 0,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    shots: shots.length,
    levels: Object.fromEntries(
      Object.entries(bank.levels).map(([k, v]) => [k, v.length]),
    ),
    rejected: rejected.length,
    paidCalls: 0,
  }),
);
