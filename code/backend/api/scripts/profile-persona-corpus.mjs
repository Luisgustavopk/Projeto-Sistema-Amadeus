import { readFile, writeFile } from 'node:fs/promises';
import {
  corpusStyleProfile,
  parseDialogueCsv,
  sourceDigest,
} from '../src/evaluation/persona/corpus-profile.ts';

const args = process.argv.slice(2);
if (args.some((a) => !a.startsWith('--csv=') && !a.startsWith('--out=')))
  throw new Error('Use --csv=CAMINHO e/ou --out=CAMINHO.');
const option = (key) =>
  args.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const revision = 'ebd640fdabf5616b6fde9c2fc12f9b9400ae0ceb';
const url = `https://raw.githubusercontent.com/Ibnelaiq/KurisuQA/${revision}/VNKurisuDialogues.csv`;
let csv;
if (option('csv')) csv = await readFile(option('csv'), 'utf8');
else {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Fonte pública indisponível.');
  csv = await response.text();
}
const rows = parseDialogueCsv(csv);
if (
  sourceDigest(csv) !==
  'c162815a10c6c8133971b03d91cebe3c2f8c607a7360ea8b5cb182745bfe4477'
)
  throw new Error(
    'CSV difere da revisão fixada; não atribua outro corpus a esta origem.',
  );
if (rows.some((row) => row.speaker !== 'Kurisu'))
  throw new Error('Autoria inesperada no CSV.');
const localUrl = new URL(
  '../../assets/persona/external/francesco-amadeus/prepared/dialogues.jsonl',
  import.meta.url,
);
const local = await readFile(localUrl, 'utf8');
const blocks = local.trim().split(/\r?\n/u).map(JSON.parse);
const profile = {
  version: 1,
  purpose: 'referência descritiva de estilo, não certificação de persona',
  definitions: {
    words:
      'whitespaceWords divide por espaços; lexicalWords usa a mesma tokenização da avaliação',
    sentences:
      'Intl.Segmenter; locale en; pontuação não garante unidade dramática',
    rates:
      'frações entre 0 e 1; hasQuestionRate não é quantidade de perguntas por turno',
    comparability:
      'Linhas do CSV, blocos do personagem e respostas do modelo são unidades diferentes; inglês e pt-BR também diferem.',
    limitations:
      'Sem cena, época ou situação no CSV; agregados não validam D1, autoria canônica ou naturalidade.',
  },
  sources: [
    {
      repository: 'https://github.com/Ibnelaiq/KurisuQA',
      revision,
      file: 'VNKurisuDialogues.csv',
      sha256: sourceDigest(csv),
      unit: 'csv-row',
      profile: corpusStyleProfile(rows.map((r) => r.text)),
    },
    {
      repository: 'https://github.com/FrancescoCaracciolo/Amadeus',
      revision: '9d4726bd37dce9919af37904e442e49205f329b8',
      file: 'prepared/dialogues.jsonl',
      sha256: sourceDigest(local),
      unit: 'prepared-speaker-block',
      profile: corpusStyleProfile(blocks.map((b) => b.target.text)),
    },
  ],
  rawTextIncluded: false,
  paidCalls: 0,
};
const output =
  option('out') ??
  new URL(
    '../../evals/persona/quality-v2.1/corpus-reference-profile.json',
    import.meta.url,
  );
await writeFile(output, JSON.stringify(profile, null, 2) + '\n');
console.log(
  JSON.stringify({
    output: String(output),
    csvRows: rows.length,
    blocks: blocks.length,
    paidCalls: 0,
  }),
);
