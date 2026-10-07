import { readFile, writeFile } from 'node:fs/promises';
import {
  calibrationAgreement,
  VerdictSchema,
} from '../src/evaluation/persona/judge.ts';
import { summarizeQualityReport } from './lib/conversation-quality-report.mjs';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';

const filename = process.argv[2];
if (
  !/^[0-9]+-quality-v2\.json$/u.test(filename ?? '') ||
  process.argv.length !== 3
)
  throw new Error('Informe o nome do relatório local quality-v2.');
const path = new URL(`../data/refinement/${filename}`, import.meta.url);
const report = JSON.parse(await readFile(path, 'utf8'));
if (report.calls.some((call) => call.status === 'pending'))
  throw new Error('Rodada em andamento.');
const scenarios = JSON.parse(
  await readFile(
    new URL(
      `../../evals/persona/quality-v2/${report.split}.json`,
      import.meta.url,
    ),
    'utf8',
  ),
).cases;
const labels = JSON.parse(
  await readFile(
    new URL(path.href.replace('.json', '-calibration.json')),
    'utf8',
  ),
);
const { calibration: expected } = summarizeQualityReport(report, scenarios);
if (
  new Set(labels.turns.map((turn) => turn.blindId)).size !== labels.turns.length
)
  throw new Error('IDs de calibração duplicados.');
const turns = report.cases.flatMap((item) =>
  item.turns.map((turn, index) => ({
    turn,
    blindId: fingerprint([
      report.createdAt,
      item.id,
      item.sample,
      item.model,
      item.variant,
      index,
    ]).slice(0, 12),
  })),
);
const pairs = [];
for (const label of labels.turns) {
  const original = expected.turns.find(
    (turn) => turn.blindId === label.blindId,
  );
  if (
    !original ||
    fingerprint({ ...label, humanChecks: null }) !== fingerprint(original)
  )
    throw new Error(
      'O contexto da ficha foi alterado; edite somente humanChecks.',
    );
  const automatic = turns.find((item) => item.blindId === label.blindId)?.turn
    .verdict;
  if (!automatic) throw new Error('Veredito automático ausente.');
  pairs.push({
    automatic,
    human:
      label.humanChecks === null
        ? null
        : VerdictSchema.parse({ checks: label.humanChecks, summary: '' }),
  });
}
const reviewed = pairs.filter((pair) => pair.human).length;
const result = {
  reviewed,
  total: expected.turns.length,
  calibrationComplete: reviewed === 30,
  agreement: calibrationAgreement(pairs),
};
await writeFile(
  new URL(path.href.replace('.json', '-agreement.json')),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
