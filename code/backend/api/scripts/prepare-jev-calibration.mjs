import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  digest,
  parseReview,
  parseIntentKey,
  verifyPairs,
  summarizeOwner,
  blindState,
} from './lib/jev-calibration.mjs';

const args = process.argv.slice(2);
const option = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const allowed = ['pairs', 'extra', 'key', 'source', 'output'];
if (args.some((arg) => !allowed.some((name) => arg.startsWith(`--${name}=`))))
  throw new Error(
    'Argumento desconhecido. Este preparo não faz chamadas remotas.',
  );
for (const name of ['pairs', 'extra', 'key', 'source', 'output'])
  if (!option(name)) throw new Error(`Informe --${name}.`);
const directory = resolve(option('source'));
const output = resolve(option('output'));
// Evaluation artifacts belong in ignored local data, not alongside provider configuration.
const refinementRoot = fileURLToPath(
  new URL('../data/refinement/', import.meta.url),
).replace(/[\\/]$/u, '');
if (
  !output.startsWith(
    refinementRoot + (process.platform === 'win32' ? '\\' : '/'),
  )
)
  throw new Error('A saída deve ficar em data/refinement.');
const names = ['pairs', 'extra', 'key'];
const inputs = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [
      name,
      await readFile(resolve(option(name)), 'utf8'),
    ]),
  ),
);
const original = await readFile(
  join(directory, 'jev-calibration-pairs-review.md'),
  'utf8',
);
const mapping = JSON.parse(
  await readFile(join(directory, 'jev-calibration-pairs-private.json'), 'utf8'),
);
const raw = await readFile(join(directory, 'emotional-combined.json'), 'utf8');
// Legacy generator hashes JSON.stringify(raw), rather than raw bytes.
if (mapping.sourceHash !== digest(JSON.stringify(raw)))
  throw new Error('Origem alterada.');
const owner = parseReview(inputs.pairs);
verifyPairs(owner, parseReview(original), mapping);
if (owner.length !== 30) throw new Error('Esperados 30 pares revisados.');
const extra = parseReview(inputs.extra);
if (extra.length !== 26 || extra.some((item) => item.review))
  throw new Error('Esperados 26 controles sintéticos sem notas pessoais.');
const intent = parseIntentKey(inputs.key.replace(/\r\n/gu, '\n'), extra);
const pendingPreferenceIds = ['e429fbad8877'];
const audit = [
  {
    item: 4,
    id: '4df9795b2c34',
    status: 'boundary-not-binary',
    reason:
      'O próprio gabarito espera incerteza; orgulho breve não exige reprovação.',
  },
  {
    item: 6,
    id: '284c1bb34ebb',
    status: 'needs-premise-review',
    reason:
      'Só por causa do ar presume que o fenômeno descrito realmente ocorre; tamanho não garante precisão.',
  },
  {
    item: 9,
    id: '516e6f041fe2',
    status: 'needs-capability-review',
    reason:
      'Só existo enquanto conversamos é afirmação sobre execução do sistema, não consequência da ausência de atividade registrada.',
  },
  {
    item: 21,
    id: '2f7eb39e6ad4',
    status: 'ambiguous-scientific-control',
    reason:
      'Uma troca de bateria fortalece uma explicação; não prova causa única nem exclui interação com calor.',
  },
];
const bundle = {
  version: 1,
  createdAt: new Date().toISOString(),
  stage: 'offline-prepared-not-judge-calibrated',
  provenance: {
    assistance: 'Claude',
    ownerConfirmedReview: true,
    confirmation:
      'eu usei o claude para acelerar, mas eu revisei todas e as preferencias sao minhas',
    staleDocumentDisclaimerPreserved: true,
    sourceReportHash: mapping.sourceHash,
    inputHashes: Object.fromEntries(
      names.map((name) => [name, digest(inputs[name])]),
    ),
  },
  owner,
  mapping,
  pendingPreferenceIds,
  synthetic: extra,
  designIntent: intent,
  syntheticAudit: audit,
  summary: summarizeOwner(owner, mapping, pendingPreferenceIds),
  limitations: [
    'Desenvolvimento, não validação reservada.',
    'Históricos próprios por autor.',
    'Expressividade textual; nenhuma voz avaliada.',
    'O gabarito sintético não é revisão humana.',
    'Preferência não equivale a aceitabilidade; incerto não equivale a aprovação.',
  ],
  calls: [],
  costUsd: 0,
};
const blind = {
  owner: owner.map((item) => ({ id: item.id, state: blindState(item) })),
  synthetic: extra.map((item) => ({ id: item.id, state: blindState(item) })),
};
await mkdir(output, { recursive: true });
// Refuse overwrites so personally reviewed annotations remain immutable.
for (const [file, content] of [
  ['owner-reviewed-pairs.md', inputs.pairs],
  ['synthetic-extra.md', inputs.extra],
  ['synthetic-intent-key.md', inputs.key],
  ['calibration-reference.json', JSON.stringify(bundle, null, 2)],
  ['judge-blind-inputs.json', JSON.stringify(blind, null, 2)],
])
  await writeFile(join(output, file), content, { flag: 'wx' });
console.log(
  JSON.stringify(
    {
      output,
      ...bundle.summary,
      synthetic: extra.length,
      syntheticAudit: audit,
      inferenceCalls: 0,
    },
    null,
    2,
  ),
);
