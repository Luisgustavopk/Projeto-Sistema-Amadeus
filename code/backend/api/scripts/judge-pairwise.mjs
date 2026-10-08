import { readFile } from 'node:fs/promises';
import {
  evaluationModels,
  createEvaluationRouter,
} from '../src/evaluation/persona/router.ts';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';
import {
  PairwiseVerdictSchema,
  stablePairwiseDecision,
  pairwiseSummary,
} from '../src/evaluation/persona/pairwise.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';

const args = process.argv.slice(2);
const option = (key, fallback) =>
  args.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3) ??
  fallback;
if (
  args.some(
    (a) =>
      a !== '--run' &&
      !['report', 'a', 'b', 'judge', 'budget'].some((k) =>
        a.startsWith(`--${k}=`),
      ),
  )
)
  throw new Error('Argumento desconhecido.');
const name = option('report', '');
if (!/^\d+-quality-v2(?:\.1)?\.json$/u.test(name))
  throw new Error('Informe relatório local por nome.');
const a = option('a', 'current'),
  b = option('b', 'card'),
  judge = option('judge', 'gemini');
const maxUsd = Number(option('budget', undefined));
if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 5)
  throw new Error('Informe --budget explícito para o teto total da v2.1.');
if (!['gemini', 'qwen', 'kimi'].includes(judge) || a === b)
  throw new Error('Juiz ou braços inválidos.');
const directory = new URL('../data/refinement/', import.meta.url);
const root = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const sourceText = await readFile(new URL(name, directory), 'utf8');
const source = JSON.parse(sourceText);
if (
  !source.synthetic ||
  source.models.some((m) => m !== 'llama') ||
  source.calls.some((c) => c.status === 'pending') ||
  !source.variants.includes(a) ||
  !source.variants.includes(b)
)
  throw new Error(
    'Relatório não é um ensaio Llama sintético concluído dos braços pedidos.',
  );
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
for (const [file, hash] of Object.entries(manifest.files))
  if (fingerprint(await readFile(new URL(file, root), 'utf8')) !== hash)
    throw new Error('Recurso alterado após congelamento.');
if (
  source.suiteManifest &&
  fingerprint(source.suiteManifest) !== fingerprint(manifest)
)
  throw new Error('Relatório usa outro manifesto.');
const rubric = await readFile(new URL('pairwise-rubric.md', root), 'utf8');
const pairs = [],
  excluded = [];
for (const left of source.cases.filter((c) => c.variant === a)) {
  const right = source.cases.find(
    (c) =>
      c.id === left.id &&
      c.sample === left.sample &&
      c.model === left.model &&
      c.variant === b,
  );
  for (const [index, turn] of left.turns.entries()) {
    const other = right?.turns[index];
    if (
      !turn.assistant ||
      turn.errors.length ||
      !other?.assistant ||
      other.errors.length ||
      turn.user !== other.user ||
      turn.initiativeKind !== other.initiativeKind
    ) {
      excluded.push({
        scenario: left.id,
        sample: left.sample,
        index,
        reason: 'missing-failed-or-unmatched',
      });
      continue;
    }
    const payload = (t) => ({
      user: t.user,
      initiativeKind: t.initiativeKind,
      history: t.history,
      facts: t.facts,
      assistant: t.assistant,
    });
    pairs.push({
      scenario: left.id,
      sample: left.sample,
      index,
      expectation: left.expectation,
      A: payload(turn),
      B: payload(other),
    });
  }
}
console.log(
  JSON.stringify({
    pairs: pairs.length,
    plannedCalls: 2 * pairs.length,
    excluded: excluded.length,
    a,
    b,
    judge,
    maxUsd,
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
const path = new URL(`${Date.now()}-quality-v2.1-pairwise.json`, directory);
const report = {
  round: 'quality-v2.1',
  source: name,
  sourceHash: fingerprint(sourceText),
  suiteManifest: manifest,
  a,
  b,
  judge,
  createdAt: new Date().toISOString(),
  synthetic: true,
  excluded,
  pairs: [],
  calls: [],
  stopped: null,
  budget: null,
  humanCalibrationComplete: false,
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
    !['temperature', 'max_tokens', 'response_format'].every((p) =>
      entry.supported_parameters.includes(p),
    )
  )
    throw new Error('Preço/parâmetro fora do contrato do juiz.');
  report.catalog = {
    id: entry.id,
    pricing: entry.pricing,
    supportedParameters: entry.supported_parameters,
  };
  const router = createEvaluationRouter({
    key: process.env.OPENROUTER_API_KEY,
    budget: round.budget,
    calls: report.calls,
    persist,
  });
  await persist();
  outer: for (const pair of pairs) {
    const item = {
      scenario: pair.scenario,
      sample: pair.sample,
      index: pair.index,
      forward: null,
      reverse: null,
      errors: [],
    };
    report.pairs.push(item);
    for (const order of ['forward', 'reverse']) {
      let text = '';
      try {
        const payload = {
          expectation: pair.expectation,
          A: order === 'forward' ? pair.A : pair.B,
          B: order === 'forward' ? pair.B : pair.A,
        };
        for await (const chunk of router.stream(
          model,
          [
            { role: 'system', content: rubric },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          700,
          'pairwise-judge',
          AbortSignal.timeout(60000),
          { temperature: 0 },
          true,
        ))
          text += chunk.content;
        item[order] = PairwiseVerdictSchema.parse(JSON.parse(text));
      } catch (error) {
        item.errors.push(
          /^EVALUATION_[A-Z_0-9]+$/u.test(error.message)
            ? error.message
            : 'JUDGE_FAILED_OR_INVALID',
        );
        if (/^EVALUATION_(BUDGET|HTTP_40|PRICE)/u.test(error.message)) {
          report.stopped = error.message;
          item.decision = stablePairwiseDecision(item.forward, item.reverse);
          break outer;
        }
      }
    }
    item.decision = stablePairwiseDecision(item.forward, item.reverse);
    await persist();
  }
  report.summary = pairwiseSummary(
    report.pairs.map((p) => ({ ...p, ...p.decision })),
  );
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
