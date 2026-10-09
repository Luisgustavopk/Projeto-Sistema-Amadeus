import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest } from './lib/jev-calibration.mjs';

const [path, ...other] = process.argv.slice(2);
if (!path || other.length)
  throw new Error('Informe somente o diretório da calibração.');
const directory = pathToFileURL(resolve(path) + '/');
const rawReference = await readFile(
  new URL('calibration-reference.json', directory),
  'utf8',
);
const reference = JSON.parse(rawReference);
const files = [
  'jev-results.json',
  'jev-results-v2.json',
  'jev-results-v3.json',
];
const reports = await Promise.all(
  files.map(async (file) =>
    JSON.parse(await readFile(new URL(file, directory), 'utf8')),
  ),
);
const quantile = (values, q) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1] ?? null;
const eligible = reference.owner.filter(
  (item) =>
    item.review.preference !== 'incerto' &&
    !reference.pendingPreferenceIds.includes(item.id),
);
const expectedIntent = { A: 'B', B: 'A', nenhum: 'empate', ambos: 'nenhuma' };
const rounds = reports.map((report, index) => {
  if (
    report.referenceHash !== digest(rawReference) ||
    report.calls.some((call) => call.status !== 'complete') ||
    report.stopped
  )
    throw new Error('Relatório incompleto ou referência divergente.');
  const actualCost = report.calls.reduce(
    (sum, call) => sum + call.usage.cost,
    0,
  );
  if (Math.abs(actualCost - report.budget.reportedUsd) > 1e-10)
    throw new Error('Custo divergente.');
  const synthetic = report.summary.synthetic
    .filter((entry) => !entry.audit)
    .map((entry) => ({
      item: entry.designIntent.number,
      id: entry.id,
      expected: expectedIntent[entry.designIntent.defectSide],
      actual: entry.actual,
    }));
  const authorChoices = report.calls.filter((call) => call.group === 'owner');
  const thresholds = [0.5, 0.7, 0.8, 0.9].map((threshold) => {
    const rows = eligible.flatMap((item) => {
      const call = authorChoices.find((entry) => entry.itemId === item.id);
      return call.answers.preference.confidence >= threshold
        ? [{ item, call }]
        : [];
    });
    return {
      threshold,
      compared: rows.length,
      matches: rows.filter(
        ({ item, call }) =>
          item.review.preference === call.answers.preference.choice,
      ).length,
      status: 'development-descriptive-not-calibrated-threshold',
    };
  });
  return {
    revision: index + 1,
    calls: report.calls.length,
    costUsd: actualCost,
    inputTokens: report.calls.reduce(
      (sum, call) => sum + call.usage.input_tokens,
      0,
    ),
    latencyP50Ms: quantile(
      report.calls.map((call) => call.latencyMs),
      0.5,
    ),
    latencyP95Ms: quantile(
      report.calls.map((call) => call.latencyMs),
      0.95,
    ),
    preference: report.summary.preference,
    thresholds,
    criteria: report.summary.criteria,
    orderChecks: report.summary.orderChecks,
    syntheticMatches: synthetic.filter(
      (entry) => entry.expected === entry.actual,
    ).length,
    syntheticCompared: synthetic.length,
    synthetic,
    syntheticExclusions: reference.syntheticAudit,
  };
});
const prior =
  reports[0].authorization.previousLedger.committedUsd +
  reports[0].authorization.previousAggregateCapUsd -
  reports[0].authorization.previousLedger.maxUsd;
const newCost = rounds.reduce((sum, round) => sum + round.costUsd, 0);
const aggregateCommittedUsd = prior + newCost;
const baseline = eligible.filter(
  (item) =>
    reference.mapping.items
      .find((entry) => entry.id === item.id)
      .options.find((entry) => entry.label === item.review.preference)
      ?.model === 'deepseek',
).length;
const result = {
  createdAt: new Date().toISOString(),
  rounds,
  baselineAlwaysDeepseek: {
    matches: baseline,
    compared: eligible.length,
    note: 'Classe majoritária no desenvolvimento, não aprovação geral do modelo.',
  },
  finance: {
    paidCalls: rounds.reduce((sum, round) => sum + round.calls, 0),
    newCostUsd: newCost,
    priorCommittedUsd: prior,
    aggregateCommittedUsd,
    aggregateCapUsd: reports[0].authorization.aggregateCapUsd,
    remainingUsd:
      reports[0].authorization.aggregateCapUsd - aggregateCommittedUsd,
  },
  routingApproved: false,
  expressiveApproval: false,
  newHeldoutUsed: false,
  audioUsed: false,
};
if (aggregateCommittedUsd > result.finance.aggregateCapUsd + 1e-10)
  throw new Error('Teto excedido.');
await writeFile(
  new URL('calibration-audit.json', directory),
  JSON.stringify(result, null, 2),
);
const lines = [
  '# Divergências de preferência — Jev v3 × proprietário',
  '',
  'Dados conhecidos de desenvolvimento; a nota pessoal foi preservada. Incerto e item 30 não entram na concordância de preferência.',
  '',
];
for (const item of eligible) {
  const call = reports[2].calls.find(
    (entry) => entry.group === 'owner' && entry.itemId === item.id,
  );
  if (call.answers.preference.choice === item.review.preference) continue;
  lines.push(
    `## Item ${item.number} — ${item.id}`,
    '',
    `Fala: ${item.current}`,
    '',
    `Preferência pessoal: ${item.review.preference}. Jev: ${call.answers.preference.choice}. Confiança reportada: ${call.answers.preference.confidence}.`,
    '',
    `Motivo pessoal: ${item.review.reason}`,
    '',
  );
  for (const side of ['A', 'B'])
    lines.push(
      `### ${side}`,
      '',
      item.options[side].context,
      '',
      `Resposta: ${item.options[side].reply}`,
      '',
    );
}
await writeFile(
  new URL('preference-disagreements-v3.md', directory),
  lines.join('\n'),
);
console.log(JSON.stringify(result, null, 2));
