import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { prepareEmotionalSuite } from '../src/evaluation/persona/emotional-suite.ts';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';

// Deliberately preparation-only: no env file, API key, inference or budget reset.
if (process.argv.length > 2)
  throw new Error('Este comando apenas prepara; não aceita --run.');
const repository = new URL('../../../../', import.meta.url);
const suitePath =
  'code/backend/evals/persona/quality-v3/personality-pt-BR.json';
const resources = {};
async function resource(path) {
  const text = await readFile(new URL(path, repository), 'utf8');
  resources[path] = fingerprint(text);
  return text;
}
const suite = JSON.parse(await resource(suitePath));
for (const path of Object.values(suite.references)) await resource(path);
const bank = JSON.parse(
  await resource('code/backend/evals/persona/quality-v2.1/shots.json'),
);
const documents = await Promise.all(
  [
    'code/backend/evals/persona/quality-v2.1/core-card.md',
    'code/backend/evals/persona/quality-v2.1/turn-direction.md',
    'code/backend/evals/persona/quality-v3/presence-positive.md',
  ].map(resource),
);
documents.push(
  ...bank.shots.flatMap((shot) =>
    shot.messages.map((message) => message.content),
  ),
);
for (const path of [
  'code/backend/api/scripts/prepare-emotional-suite.mjs',
  'code/backend/api/scripts/lib/three-model-v3-report.mjs',
  'code/backend/api/src/evaluation/persona/emotional-suite.ts',
  'code/backend/api/src/evaluation/persona/refinement-v3.ts',
  'code/backend/api/src/evaluation/persona/router.ts',
  'code/backend/api/src/application/persona/conversation-style.ts',
  'code/backend/api/src/application/persona/voice-prompt.ts',
  'code/backend/api/src/application/persona/corpus-context.ts',
  'code/backend/api/src/application/memory/memory-use-v1.md',
  'code/backend/api/src/application/voice/context.ts',
  'code/backend/api/src/application/voice/turn-processor.ts',
])
  await resource(path);
const prepared = prepareEmotionalSuite(suite, documents);
let previousBudgetRemainingUsd = null;
try {
  const ledger = JSON.parse(
    await readFile(
      new URL(
        '../data/refinement/quality-v3-025/quality-v2-1-budget.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  if (
    !Number.isFinite(ledger.maxUsd) ||
    !Number.isFinite(ledger.committedUsd) ||
    ledger.maxUsd <= 0 ||
    ledger.committedUsd < 0
  )
    throw new Error('Registro financeiro inválido.');
  previousBudgetRemainingUsd = ledger.maxUsd - ledger.committedUsd;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // A fresh checkout has no private ledger; absence is not a new authorization.
}
const frozen = {
  version: 'emotional-preparation-1',
  resources,
  prepared,
  factors: {
    canonicalMemoryDemonstrations: true,
    lexicalStyleRegeneration: false,
    headlessMemory: false,
    realSemanticJudge: false,
    fixedExamples: true,
  },
  executionAuthorized: false,
  nextStep:
    'Definir o escopo e o orçamento; verificar rotas e congelar novo manifesto de execução. Preservar a rodada histórica.',
};
const plan = {
  frozen,
  fingerprint: fingerprint(frozen),
  previousBudgetRemainingUsd,
  plannedTurnsThreeModels: prepared.plannedTurnsPerModel * 3,
  inferenceCalls: 0,
};
const directory = new URL(
  '../data/refinement/emotional-preparation/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
await writeFile(new URL('plan.json', directory), JSON.stringify(plan, null, 2));
console.log(
  JSON.stringify({
    prepared: true,
    cases: prepared.authorCases.length,
    turnsPerModel: prepared.plannedTurnsPerModel,
    plannedTurnsThreeModels: plan.plannedTurnsThreeModels,
    previousBudgetRemainingUsd: plan.previousBudgetRemainingUsd,
    inferenceCalls: 0,
  }),
);
