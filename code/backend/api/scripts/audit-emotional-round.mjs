import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readPersonaResponse } from '../src/application/persona/response-stream.ts';
import {
  fingerprint,
  quantiles,
} from '../src/evaluation/persona/diagnostics.ts';

const path = process.argv[2];
if (!path?.endsWith('.json'))
  throw new Error('Informe o relatório emocional concluído.');
const url = pathToFileURL(path);
const report = JSON.parse(await readFile(url, 'utf8'));
if (
  !report.completedAt ||
  report.calls.some((call) => call.status === 'pending')
)
  throw new Error('Aguarde a conclusão da rodada.');
const records = [];
for (const item of report.cases) {
  const criteria = report.plan.frozen.prepared.evaluationOnly.find(
    (entry) => entry.id === item.id,
  );
  for (const [index, turn] of item.turns.entries()) {
    const attempts = [];
    for (const input of turn.inputs) {
      let declaration = null;
      let expressionValid = false;
      let error = null;
      let canonicalHeader = false;
      try {
        const header = JSON.parse(
          input.raw.match(/<expression>(.*?)<\/expression>/su)?.[1] ?? 'null',
        );
        canonicalHeader = Boolean(
          header?.memory &&
          typeof header.memory === 'object' &&
          !Array.isArray(header.memory),
        );
      } catch {
        // Invalid JSON remains a structural error in the real parser below.
      }
      try {
        for await (const chunk of readPersonaResponse(
          (async function* () {
            yield input.raw;
          })(),
          (_expression, valid) => {
            expressionValid = valid;
          },
          (value) => {
            declaration = value;
          },
        ))
          void chunk;
      } catch (failure) {
        error = { name: failure.name, code: failure.code ?? null };
      }
      const criteriaText = [
        criteria.expectation,
        ...criteria.evaluation.turnChecks,
      ];
      attempts.push({
        requestHash: input.hash,
        declaration,
        expressionValid,
        error,
        validIndices:
          declaration?.facts.every((id) => id < turn.facts.length) ?? null,
        factsInMessages: turn.facts.every((fact) =>
          input.messages.some((message) =>
            message.content.includes(JSON.stringify(fact.text)),
          ),
        ),
        gradingTextInMessages: criteriaText.some((text) =>
          input.messages.some((message) => message.content.includes(text)),
        ),
        canonicalHeader,
      });
    }
    records.push({
      model: item.model,
      scenario: item.id,
      turn: index + 1,
      successful: Boolean(turn.assistant && !turn.errors.length),
      factsProvided: turn.facts.length,
      attempts,
    });
  }
}
const models = report.plan.frozen.models.map((model) => {
  const turns = report.cases
    .filter((item) => item.model === model.name)
    .flatMap((item) => item.turns);
  const entries = records.filter((entry) => entry.model === model.name);
  const successful = entries.filter((entry) => entry.successful);
  const latest = successful.map((entry) => entry.attempts.at(-1));
  const calls = report.calls.filter((call) => call.model === model.id);
  return {
    model: model.name,
    attemptedTurns: turns.length,
    deliveredTurns: successful.length,
    validFinalExpressionHeaders: latest.filter(
      (attempt) => attempt?.expressionValid,
    ).length,
    canonicalFinalHeaders: latest.filter((attempt) => attempt?.canonicalHeader)
      .length,
    invalidFinalMemoryIndices: latest.filter(
      (attempt) => attempt?.validIndices === false,
    ).length,
    gradingLeaks: entries
      .flatMap((entry) => entry.attempts)
      .filter((attempt) => attempt.gradingTextInMessages).length,
    rawToSpeechMs: quantiles(
      turns.map((turn) => turn.firstSpeechTextMs - turn.firstRawTextMs),
    ),
    speechToReleaseMs: quantiles(
      turns.map((turn) => turn.firstUsableTextMs - turn.firstSpeechTextMs),
    ),
    sentenceCounts: quantiles(turns.map((turn) => turn.diagnostics.sentences)),
    atMostTwoSentences: turns.filter((turn) => turn.diagnostics.sentences <= 2)
      .length,
    questions: turns.reduce((sum, turn) => sum + turn.diagnostics.questions, 0),
    reportedInputTokens: calls.reduce(
      (sum, call) => sum + (call.usage?.prompt_tokens ?? 0),
      0,
    ),
    reportedOutputTokens: calls.reduce(
      (sum, call) => sum + (call.usage?.completion_tokens ?? 0),
      0,
    ),
    reportedCacheReadTokens: calls.reduce(
      (sum, call) =>
        sum + (call.usage?.prompt_tokens_details?.cached_tokens ?? 0),
      0,
    ),
    remoteIdsRecorded: calls.filter((call) => call.generationId).length,
  };
});
const audit = {
  source: url.pathname,
  sourceHash: fingerprint(report),
  implementationHash: fingerprint(
    await readFile(new URL(import.meta.url), 'utf8'),
  ),
  scope:
    'Auditoria local de entrega, formato, latência e referências. Não certifica emoção, persona ou sustentação semântica; não é revisão humana ou juiz independente.',
  newPaidCalls: 0,
  semanticVerification: false,
  models,
  records,
};
await writeFile(
  new URL(url.href.replace(/\.json$/u, '-audit.json')),
  JSON.stringify(audit, null, 2),
);
console.log(JSON.stringify({ models }));
