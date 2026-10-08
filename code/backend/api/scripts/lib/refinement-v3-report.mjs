import { writeFile } from 'node:fs/promises';
import {
  fingerprint,
  quantiles,
} from '../../src/evaluation/persona/diagnostics.ts';

const good = (turn) => Boolean(turn.assistant && !turn.errors.length);
const complete = (item) => item.turns.length === 3 && item.turns.every(good);
const key = (item) => item.id + ':' + item.sample;
function metrics(turns) {
  return {
    turns: turns.length,
    firstRawMs: quantiles(turns.map((t) => t.firstRawTextMs)),
    firstSpeechMs: quantiles(turns.map((t) => t.firstSpeechTextMs)),
    firstUsableMs: quantiles(turns.map((t) => t.firstUsableTextMs)),
    rawToUsableMs: quantiles(
      turns.map((t) => t.firstUsableTextMs - t.firstRawTextMs),
    ),
    totalMs: quantiles(turns.map((t) => t.totalMs)),
    words: quantiles(turns.map((t) => t.diagnostics.words)),
    questionsPerTurn: turns.length
      ? turns.reduce((s, t) => s + t.diagnostics.questions, 0) / turns.length
      : null,
    metadataValid: turns.filter((t) => t.expression?.metadataValid).length,
    uniqueOpenings: new Set(turns.map((t) => t.diagnostics.opening)).size,
    formatRecoveries: turns.filter((t) => t.inputs.length > 1).length,
    literalExampleCopies: turns.filter(
      (t) => t.diagnostics.exampleCopy.matched.length,
    ).length,
    expressionObservers: turns.filter((t) => t.expressionObserver).length,
    validObservers: turns.filter((t) => t.expressionObserver?.value).length,
    observerAfterSpeechMs: quantiles(
      turns
        .filter((t) => t.expressionObserver)
        .map((t) => t.expressionObserver.completedMs - t.firstUsableTextMs),
    ),
  };
}

export async function summarizeRefinementV3(path, report) {
  if (report.calls.some((call) => call.status === 'pending'))
    throw new Error('Rodada em andamento.');
  const groups = [
    ...new Set(
      report.cases.map((item) =>
        [item.phase, item.variant, item.model].join(':'),
      ),
    ),
  ];
  const cells = groups.map((group) => {
    const items = report.cases.filter(
      (item) => [item.phase, item.variant, item.model].join(':') === group,
    );
    const turns = items.filter(complete).flatMap((item) => item.turns);
    return {
      group,
      attemptedConversations: items.length,
      completeConversations: items.filter(complete).length,
      failedTurns: items
        .flatMap((item) => item.turns)
        .filter((t) => t.errors.length).length,
      completeMetrics: metrics(turns),
      successfulMetrics: metrics(
        items.flatMap((item) => item.turns).filter(good),
      ),
    };
  });
  const comparisons = [];
  for (const model of report.plan.frozen.models) {
    for (const [phase, a, b] of [
      ['acting', 'baseline', 'isolated'],
      ['acting', 'isolated', 'acting'],
      ['acting', 'acting', 'grounded'],
      ['latency', 'header', 'plain'],
    ]) {
      const left = report.cases.filter(
        (item) =>
          item.phase === phase &&
          item.variant === a &&
          item.model === model.name &&
          complete(item),
      );
      const right = report.cases.filter(
        (item) =>
          item.phase === phase &&
          item.variant === b &&
          item.model === model.name &&
          complete(item),
      );
      const keys = left
        .map(key)
        .filter((id) => right.some((item) => key(item) === id));
      comparisons.push({
        phase,
        model: model.name,
        a,
        b,
        completePairedConversations: keys.length,
        keys,
        left: metrics(
          left
            .filter((item) => keys.includes(key(item)))
            .flatMap((item) => item.turns),
        ),
        right: metrics(
          right
            .filter((item) => keys.includes(key(item)))
            .flatMap((item) => item.turns),
        ),
      });
    }
  }
  const callsByModel = report.plan.frozen.models.map((model) => {
    const calls = report.calls.filter((call) => call.model === model.id);
    return {
      model: model.name,
      calls: calls.length,
      reportedUsd: calls.reduce((sum, c) => sum + (c.usage?.cost ?? 0), 0),
      reservedUnknownUsd: calls
        .filter((c) => c.usage?.cost == null)
        .reduce((sum, c) => sum + c.reservedUsd, 0),
      observerCalls: calls.filter((c) => c.purpose === 'expression-observer')
        .length,
      cacheReadTokens: calls.reduce(
        (sum, c) => sum + (c.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        0,
      ),
    };
  });
  const summary = {
    source: path.pathname,
    sourceHash: fingerprint(report),
    cells,
    comparisons,
    callsByModel,
    plannedTurns: report.plan.plannedTurns,
    attemptedTurns: report.cases.flatMap((item) => item.turns).length,
    successfulTurns: report.cases.flatMap((item) => item.turns).filter(good)
      .length,
    calls: report.calls.length,
    failedCalls: report.calls
      .filter((call) => call.status !== 'completed')
      .map((call) => ({
        model: call.model,
        purpose: call.purpose,
        error: call.error,
        reservedUsd: call.reservedUsd,
      })),
    committedUsd: report.budget.roundCommittedUsd,
    remainingUsd: report.budget.roundMaxUsd - report.budget.roundCommittedUsd,
    stopped: report.stopped,
    humanApproval: false,
  };
  await writeFile(
    new URL(path.href.replace('.json', '-summary.json')),
    JSON.stringify(summary, null, 2),
  );
  const pools = groups
    .filter((g) => !g.startsWith('latency:'))
    .map((group) =>
      report.cases
        .filter(
          (item) => [item.phase, item.variant, item.model].join(':') === group,
        )
        .flatMap((item) =>
          item.turns.filter(good).map((turn) => ({ item, turn })),
        )
        .toSorted((a, b) =>
          fingerprint([a.item.id, a.item.sample, a.turn.user]).localeCompare(
            fingerprint([b.item.id, b.item.sample, b.turn.user]),
          ),
        ),
    );
  const selected = [];
  while (selected.length < 30 && pools.some((pool) => pool.length)) {
    for (const pool of pools) {
      if (selected.length >= 30) break;
      if (pool.length) selected.push(pool.shift());
    }
  }
  const privateKeys = [];
  const review = selected.map(({ item, turn }) => {
    const id = fingerprint([
      path.pathname,
      item.phase,
      item.id,
      item.model,
      item.variant,
      item.sample,
      turn.user,
    ]).slice(0, 12);
    privateKeys.push({
      id,
      model: item.model,
      variant: item.variant,
      sample: item.sample,
      scenario: item.id,
      phase: item.phase,
    });
    return {
      id,
      expectation: item.expectation,
      user: turn.user,
      initiativeKind: turn.initiativeKind,
      history: turn.history,
      facts: turn.facts.map((f) => f.text),
      assistant: turn.assistant,
      humanChecks: null,
    };
  });
  await writeFile(
    new URL(path.href.replace('.json', '-review.json')),
    JSON.stringify(
      {
        evaluatorKind: 'unreviewed',
        personallyReviewed: false,
        blind: true,
        items: review,
      },
      null,
      2,
    ),
  );
  await writeFile(
    new URL(path.href.replace('.json', '-review-private.json')),
    JSON.stringify(privateKeys, null, 2),
  );
  const markdown =
    '# Revisão humana cega v3\n\nAvalie a resposta atual; o histórico serve de contexto. Critérios: interlocução, proporcionalidade, sustentação factual, continuidade, persona, perguntas, recomendações e cânone. Use aprova/reprova/incerto/não aplicável e um motivo. Autor, braço e notas automáticas estão ocultos. As fichas ainda não têm avaliação humana.\n\n' +
    review
      .map(
        (t, i) =>
          '## ' +
          (i + 1) +
          '. ' +
          t.id +
          '\n\nExpectativa: ' +
          t.expectation +
          '\n\nFatos: ' +
          JSON.stringify(t.facts) +
          '\n\nHistórico: ' +
          JSON.stringify(t.history) +
          '\n\nPessoa agora: ' +
          (t.user || '[iniciativa]') +
          '\n\nResposta avaliada: ' +
          t.assistant +
          '\n',
      )
      .join('\n');
  await writeFile(new URL(path.href.replace('.json', '-review.md')), markdown);
  const transcription =
    '# Transcrições v3 — autores revelados\n\nConsulte somente depois da revisão cega.\n\n' +
    report.cases
      .map(
        (item) =>
          '## ' +
          [item.phase, item.id, item.model, item.variant, item.sample].join(
            ' / ',
          ) +
          '\n\n' +
          item.turns
            .map(
              (t) =>
                'Pessoa: ' +
                (t.user || '[iniciativa]') +
                '\n\nAmadeus: ' +
                (t.assistant || '[sem resposta final]') +
                '\n\nErros: ' +
                JSON.stringify(t.errors),
            )
            .join('\n\n'),
      )
      .join('\n\n');
  await writeFile(
    new URL(path.href.replace('.json', '-transcription.md')),
    transcription,
  );
  return summary;
}
