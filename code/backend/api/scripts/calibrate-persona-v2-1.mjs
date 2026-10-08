import { readFile } from 'node:fs/promises';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';
import {
  calibrationAgreement,
  judgeCriteria,
  parseVerdict,
  VerdictSchema,
} from '../src/evaluation/persona/judge.ts';
import {
  createEvaluationRouter,
  evaluationModels,
} from '../src/evaluation/persona/router.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import { parseScenarioDataset } from '../src/evaluation/persona/experimental-suite.ts';
import { summarizeQualityReport } from './lib/conversation-quality-report.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ??
  fallback;
if (
  args.some(
    (a) =>
      a !== '--run' &&
      !['report', 'judge', 'budget'].some((name) => a.startsWith(`--${name}=`)),
  )
)
  throw new Error('Argumento desconhecido.');
const name = option('report', '');
if (!/^\d+-quality-v2(?:\.1)?\.json$/u.test(name))
  throw new Error('Informe o relatório local da ficha humana.');
const judge = option('judge', 'qwen');
const maxUsd = Number(option('budget', undefined));
if (!['gemini', 'qwen', 'kimi'].includes(judge))
  throw new Error('Juiz independente inválido.');
if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 5)
  throw new Error('Informe --budget para o teto agregado da rodada.');

const directory = new URL('../data/refinement/', import.meta.url);
const root = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const sourceText = await readFile(new URL(name, directory), 'utf8');
const source = JSON.parse(sourceText);
if (!source.synthetic || source.calls.some((c) => c.status === 'pending'))
  throw new Error('Relatório não é sintético ou está em andamento.');
const labelsText = await readFile(
  new URL(name.replace('.json', '-calibration.json'), directory),
  'utf8',
);
const labels = JSON.parse(labelsText);
const scenarios = parseScenarioDataset(
  await readFile(
    new URL(
      `../../evals/persona/quality-v2/${source.split}.json`,
      import.meta.url,
    ),
    'utf8',
  ),
).cases;
const expected = summarizeQualityReport(source, scenarios).calibration;
if (
  labels.turns.length !== 30 ||
  new Set(labels.turns.map((t) => t.blindId)).size !== 30
)
  throw new Error('Use 30 fichas humanas distintas.');
for (const label of labels.turns) {
  const original = expected.turns.find((t) => t.blindId === label.blindId);
  if (
    !original ||
    fingerprint({ ...label, humanChecks: null }) !== fingerprint(original)
  )
    throw new Error(
      'Contexto da ficha alterado; somente humanChecks é editável.',
    );
  VerdictSchema.parse({ checks: label.humanChecks, summary: '' });
}
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
for (const [file, hash] of Object.entries(manifest.files))
  if (fingerprint(await readFile(new URL(file, root), 'utf8')) !== hash)
    throw new Error('Recurso alterado após congelamento.');
const rubric = await readFile(new URL('rubric.md', root), 'utf8');
console.log(
  JSON.stringify({
    reviewed: labels.turns.length,
    judge,
    maxUsd,
    plannedCalls: 30,
    humanLabelsHiddenFromJudge: true,
    sharedBudgetForAuthorAndJudges: true,
    run: args.includes('--run'),
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('Configure OPENROUTER_API_KEY.');

const round = await openSharedEvaluationRound(
  directory,
  maxUsd,
  fingerprint(manifest),
);
const path = new URL(
  `${Date.now()}-quality-v2.1-judge-calibration.json`,
  directory,
);
const report = {
  source: name,
  sourceHash: fingerprint(sourceText),
  humanLabelsHash: fingerprint(labelsText),
  suiteManifest: manifest,
  rubricHash: fingerprint(rubric),
  createdAt: new Date().toISOString(),
  judge,
  synthetic: true,
  calls: [],
  turns: [],
  budget: null,
  stopped: null,
  summary: null,
};
const persist = () => round.persist(path, report);
try {
  const model = evaluationModels[judge];
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Catálogo indisponível.');
  const entry = (await response.json()).data.find((e) => e.id === model.id);
  if (
    !entry ||
    Number(entry.pricing.prompt) * 1e6 > model.prompt ||
    Number(entry.pricing.completion) * 1e6 > model.completion ||
    Number(entry.pricing.request ?? 0) > 0 ||
    ['temperature', 'max_tokens', 'response_format'].some(
      (p) => !entry.supported_parameters.includes(p),
    )
  )
    throw new Error('Preço ou parâmetros fora do contrato da avaliação.');
  report.catalog = { id: entry.id, pricing: entry.pricing };
  await persist();
  const router = createEvaluationRouter({
    key: process.env.OPENROUTER_API_KEY,
    budget: round.budget,
    calls: report.calls,
    persist,
  });
  for (const label of labels.turns) {
    const item = {
      blindId: label.blindId,
      human: VerdictSchema.parse({ checks: label.humanChecks, summary: '' }),
      automatic: null,
      rawVerdict: '',
      error: null,
    };
    report.turns.push(item);
    try {
      for await (const chunk of router.stream(
        model,
        [
          {
            role: 'system',
            content:
              rubric +
              '\nEvidências curtas, até 120 caracteres cada. Para applicable:false use pass:null.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              expectation: label.expectation,
              user: label.user,
              history: label.history,
              facts: label.facts,
              initiativeKind: label.initiativeKind,
              assistant: label.assistant,
            }),
          },
        ],
        900,
        'judge-calibration',
        AbortSignal.timeout(60000),
        { temperature: 0 },
        true,
      ))
        item.rawVerdict += chunk.content;
      item.automatic = parseVerdict(item.rawVerdict);
    } catch (error) {
      item.error = /^EVALUATION_[A-Z_0-9]+$/u.test(error.message ?? '')
        ? error.message
        : 'JUDGE_FAILED_OR_INVALID';
      if (
        [
          'EVALUATION_BUDGET_EXHAUSTED',
          'EVALUATION_PRICE_CEILING_VIOLATION',
          'EVALUATION_HTTP_401',
          'EVALUATION_HTTP_402',
          'EVALUATION_HTTP_403',
        ].includes(item.error)
      ) {
        report.stopped = item.error;
        break;
      }
    }
    await persist();
    console.log(
      JSON.stringify({
        completed: report.turns.length,
        valid: !!item.automatic,
        spentUsd: round.snapshot().roundCommittedUsd,
      }),
    );
  }
  const pairs = report.turns.filter((t) => t.automatic);
  report.summary = {
    reviewed: 30,
    attempted: report.turns.length,
    validVerdicts: pairs.length,
    agreement: calibrationAgreement(pairs),
    coverage: Object.fromEntries(
      judgeCriteria.map((key) => [
        key,
        {
          humanDefined: labels.turns.filter(
            (t) =>
              t.humanChecks[key].applicable && t.humanChecks[key].pass !== null,
          ).length,
          humanFailures: labels.turns.filter(
            (t) =>
              t.humanChecks[key].applicable &&
              t.humanChecks[key].pass === false,
          ).length,
          judgeDefined: pairs.filter(
            (t) =>
              t.automatic.checks[key].applicable &&
              t.automatic.checks[key].pass !== null,
          ).length,
          judgeAbstentions: pairs.filter(
            (t) =>
              t.automatic.checks[key].applicable &&
              t.automatic.checks[key].pass === null,
          ).length,
        },
      ]),
    ),
    approved: false,
    limitations: [
      'Esta amostra cobre dois cenários; não valida recomendações nem cânone.',
      'Abstenções, erros e incertezas humanas não contam como concordância.',
      'As notas humanas não foram enviadas ao juiz; nenhuma resposta do autor foi regenerada.',
      'Calibração é diagnóstico; não certifica fidelidade nem substitui validação reservada.',
    ],
  };
  await persist();
  console.log(
    JSON.stringify({
      report: path.pathname,
      summary: report.summary,
      budget: report.budget,
    }),
  );
} finally {
  await round.close();
}
