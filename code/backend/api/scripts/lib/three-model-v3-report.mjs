import { writeFile } from 'node:fs/promises';
import {
  fingerprint,
  quantiles,
} from '../../src/evaluation/persona/diagnostics.ts';

const good = (turn) => Boolean(turn.assistant && !turn.errors.length);
function metrics(turns) {
  return {
    turns: turns.length,
    firstRawMs: quantiles(turns.map((turn) => turn.firstRawTextMs)),
    firstSpeechMs: quantiles(turns.map((turn) => turn.firstSpeechTextMs)),
    firstUsableMs: quantiles(turns.map((turn) => turn.firstUsableTextMs)),
    totalMs: quantiles(turns.map((turn) => turn.totalMs)),
    words: quantiles(turns.map((turn) => turn.diagnostics.words)),
    questionsPerTurn: turns.length
      ? turns.reduce((sum, turn) => sum + turn.diagnostics.questions, 0) /
        turns.length
      : null,
    formatRecoveries: turns.filter((turn) => turn.inputs.length > 1).length,
    metadataValid: turns.filter((turn) => turn.expression?.metadataValid)
      .length,
    literalExampleCopies: turns.filter(
      (turn) => turn.diagnostics.exampleCopy.matched.length,
    ).length,
  };
}

export async function summarizeThreeModelV3(path, report) {
  if (report.calls.some((call) => call.status === 'pending'))
    throw new Error('Rodada em andamento.');
  const names = report.plan.frozen.models.map((model) => model.name);
  const expectedTurns = new Map(
    report.plan.frozen.jobs.map((job) => [
      job.scenario.id,
      job.scenario.turns.length,
    ]),
  );
  const complete = (item) =>
    item.turns.length === expectedTurns.get(item.id) && item.turns.every(good);
  const ids = [
    ...new Set(report.plan.frozen.jobs.map((job) => job.scenario.id)),
  ];
  const common = ids.filter((id) =>
    names.every((model) =>
      report.cases.some(
        (item) => item.id === id && item.model === model && complete(item),
      ),
    ),
  );
  const firstInputComparisons = ids.map((id) => {
    const hashes = names.map((model) => ({
      model,
      hash: report.cases.find((item) => item.id === id && item.model === model)
        ?.turns[0]?.inputs[0]?.hash,
    }));
    return {
      id,
      hashes,
      identical:
        hashes.every((item) => item.hash) &&
        new Set(hashes.map((item) => item.hash)).size === 1,
    };
  });
  const summary = {
    scope: report.plan.frozen.scope,
    plannedTurns: report.plan.plannedTurns,
    attemptedTurns: report.cases.reduce(
      (sum, item) => sum + item.turns.length,
      0,
    ),
    commonCompleteScenarios: common,
    firstInputComparisons,
    models: names.map((model) => {
      const items = report.cases.filter((item) => item.model === model);
      const calls = report.calls.filter(
        (call) =>
          call.model ===
          report.plan.frozen.models.find((entry) => entry.name === model).id,
      );
      return {
        model,
        attemptedConversations: items.length,
        completeConversations: items.filter(complete).length,
        failedTurns: items
          .flatMap((item) => item.turns)
          .filter((turn) => turn.errors.length).length,
        calls: calls.length,
        reportedUsd: calls.reduce(
          (sum, call) => sum + (call.usage?.cost ?? 0),
          0,
        ),
        retainedUnknownUsd: calls
          .filter((call) => call.usage?.cost == null)
          .reduce((sum, call) => sum + call.reservedUsd, 0),
        errors: calls.filter((call) => call.error).map((call) => call.error),
        successful: metrics(items.flatMap((item) => item.turns).filter(good)),
        matched: metrics(
          items
            .filter((item) => common.includes(item.id))
            .flatMap((item) => item.turns),
        ),
      };
    }),
    budget: report.budget,
    remainingUsd: report.budget.roundMaxUsd - report.budget.roundCommittedUsd,
    stopped: report.stopped,
    qualityApproval:
      'Pendente de revisão; métricas automáticas não comprovam personalidade.',
  };
  const base = path.href.replace(/\.json$/u, '');
  await writeFile(
    new URL(base + '-summary.json'),
    JSON.stringify(summary, null, 2),
  );
  const transcript = [
    '# Comparação textual v3 — três modelos',
    '',
    report.plan.frozen.scope,
    '',
  ];
  for (const item of report.cases) {
    transcript.push(`## ${item.id} — ${item.model} (${item.variant})`, '');
    item.turns.forEach((turn, index) =>
      transcript.push(
        `**Turno ${index + 1} · Pessoa:** ${turn.user || '[iniciativa]'}`,
        '',
        `**Amadeus:** ${turn.assistant || '[sem resposta]'}`,
        '',
        `Erros: ${turn.errors.join(', ') || 'nenhum'}`,
        '',
      ),
    );
  }
  await writeFile(new URL(base + '-transcription.md'), transcript.join('\n'));
  const review = [
    '# Revisão cega — três modelos com ajustes v3',
    '',
    'Uma amostra por conversa. As respostas dos turnos posteriores seguem o histórico próprio de cada autor. As letras mudam por item; mapeamento em arquivo privado.',
    '',
    'Critérios: interlocução, proporcionalidade, sustentação factual, continuidade, persona, perguntas, recomendações e cânone. Marque aprova/reprova/incerto/não aplicável e o motivo.',
    '',
    'No roteiro emocional, avalie também adequação ao gatilho e ao alvo, intensidade proporcional e transição após reparo. Julgue a fala antes de consultar metadados; neutralidade pode ser adequada sem comprovar fidelidade.',
    '',
  ];
  const mappings = [];
  let count = 0;
  for (const id of common) {
    const items = names.map((model) =>
      report.cases.find((item) => item.id === id && item.model === model),
    );
    for (let index = 0; index < expectedTurns.get(id); index++) {
      count++;
      const sorted = [...items].sort((a, b) =>
        fingerprint([
          report.plan.fingerprint,
          id,
          index,
          a.model,
        ]).localeCompare(
          fingerprint([report.plan.fingerprint, id, index, b.model]),
        ),
      );
      const itemId = fingerprint([report.plan.fingerprint, id, index]).slice(
        0,
        12,
      );
      review.push(
        `## Item ${count} — ${itemId}`,
        '',
        `**Fala atual:** ${items[0].turns[index].user || '[iniciativa durante silêncio]'}`,
        '',
        '**Fatos fornecidos:**',
        '',
        ...items[0].turns[index].facts.map((fact) => '- ' + fact.text),
        '',
      );
      const mapping = { itemId, scenario: id, turn: index + 1, authors: {} };
      sorted.forEach((item, authorIndex) => {
        const label = 'ABC'[authorIndex];
        mapping.authors[label] = item.model;
        const turn = item.turns[index];
        review.push(`### ${label}`, '');
        for (const earlier of turn.history)
          review.push(
            `Pessoa: ${earlier.userText || '[iniciativa]'}`,
            '',
            `Amadeus: ${earlier.sentText}`,
            '',
          );
        review.push(
          `**Resposta ${label}:** ${turn.assistant}`,
          '',
          'Avaliação: ',
          '',
        );
      });
      mappings.push(mapping);
    }
  }
  await writeFile(new URL(base + '-review.md'), review.join('\n'));
  await writeFile(
    new URL(base + '-review-private.json'),
    JSON.stringify(
      { manifestHash: report.plan.fingerprint, items: mappings },
      null,
      2,
    ),
  );
  return summary;
}
