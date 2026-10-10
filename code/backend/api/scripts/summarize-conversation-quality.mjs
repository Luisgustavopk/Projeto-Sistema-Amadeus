import { readFile, writeFile } from 'node:fs/promises';
import {
  summarizeQualityReport,
  renderCalibration,
} from './lib/conversation-quality-report.mjs';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';
import { parseScenarioDataset } from '../src/evaluation/persona/experimental-suite.ts';

const filename = process.argv[2];
if (
  !/^[0-9]+-quality-v2(?:\.1)?\.json$/u.test(filename ?? '') ||
  process.argv.length !== 3
)
  throw new Error('Informe somente o nome do relatório local quality-v2.');
const reportPath = new URL(`../data/refinement/${filename}`, import.meta.url);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const scenarios = parseScenarioDataset(
  await readFile(
    new URL(
      `../../evals/persona/quality-v2/${report.split}.json`,
      import.meta.url,
    ),
    'utf8',
  ),
).cases;
const pending = report.calls.filter((call) => call.status === 'pending');
if (
  pending.length &&
  (!report.summary ||
    report.budget.unresolvedCalls ||
    pending.some((call) => call.elapsedMs === undefined))
)
  throw new Error('A rodada ainda está em andamento; aguarde a conclusão.');
// Older runner snapshots used pending for generators closed by the consumer.
// A finalized report and reconciled ledger prove those streams have ended.
for (const call of pending) {
  call.status = 'failed';
  call.error = 'EVALUATION_STREAM_CLOSED';
}
const { markdown, calibration } = summarizeQualityReport(report, scenarios);
const calibrationPath = new URL(
  reportPath.href.replace('.json', '-calibration.json'),
);
let existing;
try {
  existing = JSON.parse(await readFile(calibrationPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (existing?.turns.some((turn) => turn.humanChecks !== null)) {
  if (
    fingerprint(
      existing.turns.map((turn) => ({ ...turn, humanChecks: null })),
    ) !== fingerprint(calibration.turns)
  )
    throw new Error(
      'A ficha revisada difere dos turnos congelados; não será sobrescrita.',
    );
  calibration.turns = existing.turns;
}
await writeFile(reportPath, JSON.stringify(report, null, 2));
await writeFile(new URL(reportPath.href.replace('.json', '.md')), markdown);
await writeFile(
  new URL(reportPath.href.replace('.json', '-calibration.md')),
  renderCalibration(calibration),
);
await writeFile(calibrationPath, JSON.stringify(calibration, null, 2));
console.log(
  JSON.stringify({
    completedTurns: report.completedTurns,
    normalizedVerdicts: report.normalizedVerdicts,
    calibrationTurns: calibration.turns.length,
    budget: report.budget,
  }),
);
