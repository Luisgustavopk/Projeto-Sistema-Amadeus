import { readFile, writeFile } from 'node:fs/promises';
import {
  quantiles,
  fingerprint,
} from '../src/evaluation/persona/diagnostics.ts';

const filename = process.argv[2];
if (
  !/^\d+-llama-deepseek\.json$/u.test(filename ?? '') ||
  process.argv.slice(3).some((arg) => arg !== '--three-models')
) {
  throw new Error('Informe somente o nome do relatório local da comparação.');
}
const path = new URL(
  '../data/refinement/' +
    (process.argv.includes('--three-models') ? 'models-three-005/' : '') +
    filename,
  import.meta.url,
);
const report = JSON.parse(await readFile(path, 'utf8'));
if (report.calls.some((call) => call.status === 'pending'))
  throw new Error('Ensaio em andamento.');
const good = (turn) => !!turn?.assistant && !turn.errors.length;
const names = report.plan.frozen.models.map((model) => model.name);
const key = (item) => item.id + ':' + item.sample;
const keys = [...new Set(report.cases.map(key))];
const getCase = (id, name) =>
  report.cases.find((item) => key(item) === id && item.model === name);
const completeKeys = keys.filter((id) =>
  names.every((name) => {
    const item = getCase(id, name);
    return item?.turns.length === 3 && item.turns.every(good);
  }),
);
const matchedKeys = keys.flatMap((id) =>
  [0, 1, 2]
    .filter((index) =>
      names.every((name) => good(getCase(id, name)?.turns[index])),
    )
    .map((index) => id + ':' + index),
);

function metrics(turns) {
  return {
    turns: turns.length,
    firstRawMs: quantiles(turns.map((turn) => turn.firstRawTextMs)),
    firstSpeechMs: quantiles(turns.map((turn) => turn.firstSpeechTextMs)),
    firstUsableMs: quantiles(turns.map((turn) => turn.firstUsableTextMs)),
    totalMs: quantiles(turns.map((turn) => turn.totalMs)),
    words: quantiles(turns.map((turn) => turn.diagnostics.words)),
    questions: turns.reduce((sum, turn) => sum + turn.diagnostics.questions, 0),
    questionsPerTurn: turns.length
      ? turns.reduce((sum, turn) => sum + turn.diagnostics.questions, 0) /
        turns.length
      : null,
    metadataValid: turns.filter((turn) => turn.expression?.metadataValid)
      .length,
    exampleLiteralCopies: turns.filter(
      (turn) => turn.diagnostics.exampleCopy.matched.length,
    ).length,
  };
}

const cells = names.map((name) => {
  const cohort = report.cases.filter(
    (item) => item.model === name && completeKeys.includes(key(item)),
  );
  const paired = report.cases
    .filter((item) => item.model === name)
    .flatMap((item) =>
      item.turns.filter((_turn, index) =>
        matchedKeys.includes(key(item) + ':' + index),
      ),
    );
  const calls = report.calls.filter(
    (call) =>
      call.model ===
      report.plan.frozen.models.find((model) => model.name === name).id,
  );
  const memoryDeclarations = cohort
    .filter((item) => item.split === 'memory')
    .map((item) => ({
      scenario: item.id,
      sample: item.sample,
      turns: item.turns.map((turn) => {
        let memory = null;
        const header = /^<expression>(.*?)<\/expression>/su.exec(turn.rawReply);
        if (header) {
          try {
            memory = JSON.parse(header[1]).memory;
          } catch {
            /* Raw report is preserved. */
          }
        }
        return {
          user: turn.user,
          memory,
          factsInPrompt: turn.inputs[0]?.messages[0]?.content.includes(
            item.id === 'M01' ? 'The Witness' : 'horta',
          ),
        };
      }),
    }));
  return {
    name,
    completePairedConversations: cohort.length,
    completePairedMetrics: metrics(cohort.flatMap((item) => item.turns)),
    allPairedTurnMetrics: metrics(paired),
    reportedCostUsd: calls.reduce(
      (sum, call) => sum + (call.usage?.cost ?? 0),
      0,
    ),
    reportedCalls: calls.filter((call) => typeof call.usage?.cost === 'number')
      .length,
    unknownCostReservedUsd: calls
      .filter((call) => call.usage?.cost == null)
      .reduce((sum, call) => sum + call.reservedUsd, 0),
    reasoningTokens: calls.reduce(
      (sum, call) =>
        sum + (call.usage?.completion_tokens_details?.reasoning_tokens ?? 0),
      0,
    ),
    memoryDeclarations,
  };
});
const result = {
  source: filename,
  sourceHash: fingerprint(report),
  completeKeys,
  matchedTurnsEach: matchedKeys.length,
  cells,
  requestedCalls: report.calls.length,
  completedCalls: report.calls.filter((call) => call.status === 'completed')
    .length,
  failedCalls: report.calls
    .filter((call) => call.status !== 'completed')
    .map((call) => ({
      model: call.model,
      error: call.error,
      reservedUsd: call.reservedUsd,
    })),
  successfulTurns: report.cases.flatMap((item) => item.turns).filter(good)
    .length,
  attemptedTurns: report.cases.flatMap((item) => item.turns).length,
  conservativeSpendUsd:
    report.budget.roundCommittedUsd - report.priorCommittedUsd,
  remainingUsd: report.budget.roundMaxUsd - report.budget.roundCommittedUsd,
};
await writeFile(
  new URL(path.href.replace('.json', '-matched-audit.json')),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
