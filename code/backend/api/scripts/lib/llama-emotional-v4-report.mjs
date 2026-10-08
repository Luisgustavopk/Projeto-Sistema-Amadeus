import { readFile, writeFile } from 'node:fs/promises';
import {
  fingerprint,
  quantiles,
} from '../../src/evaluation/persona/diagnostics.ts';

const complete = (item) =>
  item.turns.length === 4 &&
  item.turns.every((turn) => turn.assistant && !turn.errors.length);
function measures(items, calls) {
  const turns = items.flatMap((item) => item.turns);
  const delivered = turns.filter(
    (turn) => turn.assistant && !turn.errors.length,
  );
  const ids = new Set(turns.flatMap((turn) => turn.callIds ?? []));
  const selectedCalls = calls.filter((call) => ids.has(call.id));
  return {
    attemptedConversations: items.length,
    completeConversations: items.filter(complete).length,
    attemptedTurns: turns.length,
    deliveredTurns: delivered.length,
    calls: selectedCalls.length,
    reportedUsd: selectedCalls.reduce(
      (sum, call) => sum + (call.usage?.cost ?? 0),
      0,
    ),
    firstRawMs: quantiles(delivered.map((turn) => turn.firstRawTextMs)),
    firstSpeechMs: quantiles(delivered.map((turn) => turn.firstSpeechTextMs)),
    firstReleasedMs: quantiles(delivered.map((turn) => turn.firstUsableTextMs)),
    totalMs: quantiles(delivered.map((turn) => turn.totalMs)),
    words: quantiles(delivered.map((turn) => turn.diagnostics.words)),
    questionsPerTurn: delivered.length
      ? delivered.reduce((sum, turn) => sum + turn.diagnostics.questions, 0) /
        delivered.length
      : null,
    atMostTwoSentences: delivered.filter(
      (turn) => turn.diagnostics.sentences <= 2,
    ).length,
    metadataValid: delivered.filter((turn) => turn.expression?.metadataValid)
      .length,
    // Evaluation-only observations. These are neither style vetoes nor approvals.
    microPauseTurns: delivered.filter((turn) =>
      /\.{3}|…|\b(?:hm|hmm|hum)\b/iu.test(turn.assistant),
    ).length,
    serviceMarkerTurns: delivered.filter((turn) =>
      /como posso ajudar|posso ajudar em|[aà] disposi[cç][aã]o|precisa de uma m[aã]o|quer (?:falar|conversar) de mais alguma coisa/iu.test(
        turn.assistant,
      ),
    ).length,
  };
}
const sourceWithoutFactor = (messages, factor) =>
  messages.map((message) => ({
    ...message,
    content: message.content.replace(
      '\n<persona_expressive_direction>\n' +
        factor +
        '\n</persona_expressive_direction>',
      '',
    ),
  }));

export async function summarizeLlamaEmotionalV4(path, report) {
  if (
    !report.completedAt ||
    report.calls.some((call) => call.status === 'pending')
  )
    throw new Error('Rodada em andamento.');
  const comparisons = report.cases.filter(
    (item) => item.phase === 'comparison',
  );
  const matched = [];
  const firstInputComparisons = [];
  const mappings = [];
  const items = [];
  for (const scenario of report.plan.frozen.design.pairedScenarios) {
    for (let sample = 1; sample <= 3; sample++) {
      const pair = comparisons.filter(
        (item) => item.id === scenario && item.sample === sample,
      );
      const before = pair.find((item) => item.variant === 'before');
      const after = pair.find((item) => item.variant === 'after');
      if (before?.turns[0]?.inputs[0] && after?.turns[0]?.inputs[0]) {
        firstInputComparisons.push({
          scenario,
          sample,
          equivalentExceptExpressiveDirection:
            fingerprint(
              sourceWithoutFactor(
                before.turns[0].inputs[0].messages,
                report.plan.frozen.expressiveDirection,
              ),
            ) ===
            fingerprint(
              sourceWithoutFactor(
                after.turns[0].inputs[0].messages,
                report.plan.frozen.expressiveDirection,
              ),
            ),
          beforeContainsFactor: before.turns[0].inputs[0].messages.some(
            (message) =>
              message.content.includes(report.plan.frozen.expressiveDirection),
          ),
          afterContainsFactor: after.turns[0].inputs[0].messages.some(
            (message) =>
              message.content.includes(report.plan.frozen.expressiveDirection),
          ),
        });
      }
      if (pair.length !== 2 || !pair.every(complete)) continue;
      matched.push(...pair);
      for (let index = 0; index < 4; index++) {
        const id = fingerprint([
          scenario,
          sample,
          index,
          report.plan.fingerprint,
        ]).slice(0, 12);
        const ordered = [...pair].sort((a, b) =>
          fingerprint([id, a.variant]).localeCompare(
            fingerprint([id, b.variant]),
          ),
        );
        const options = ordered.map((item, position) => {
          const turn = item.turns[index];
          const label = String.fromCharCode(65 + position);
          mappings.push({
            id,
            scenario,
            sample,
            turn: index + 1,
            label,
            variant: item.variant,
          });
          return {
            label,
            history: turn.history,
            facts: turn.facts.map((fact) => fact.text),
            assistant: turn.assistant,
          };
        });
        items.push({
          id,
          user: ordered[0].turns[index].user,
          initiativeKind: ordered[0].turns[index].initiativeKind,
          options,
          humanChecks: null,
        });
      }
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  const summary = {
    scope: report.plan.frozen.scope,
    semanticVerification: false,
    humanReviewCompleted: false,
    plannedTurns: report.plan.plannedTurns,
    attemptedTurns: report.cases.reduce(
      (sum, item) => sum + item.turns.length,
      0,
    ),
    pairedConversationsPerArm: matched.length / 2,
    firstInputComparisons,
    comparison: Object.fromEntries(
      ['before', 'after'].map((variant) => [
        variant,
        {
          allAttempts: measures(
            comparisons.filter((item) => item.variant === variant),
            report.calls,
          ),
          matchedComplete: measures(
            matched.filter((item) => item.variant === variant),
            report.calls,
          ),
        },
      ]),
    ),
    candidateCoverage: measures(
      report.cases.filter((item) => item.phase === 'coverage'),
      report.calls,
    ),
    budget: report.budget,
    newReportedUsd: report.calls.reduce(
      (sum, call) => sum + (call.usage?.cost ?? 0),
      0,
    ),
    totalCommittedUsd: report.budget.roundCommittedUsd,
    remainingUsd: report.budget.roundMaxUsd - report.budget.roundCommittedUsd,
    stopped: report.stopped,
    qualityApproval:
      'Pendente de revisão humana; contagem de bordões ou marcadores não aprova atuação.',
  };
  const prefix = path.href.replace(/\.json$/u, '');
  await writeFile(
    new URL(prefix + '-summary.json'),
    JSON.stringify(summary, null, 2),
  );
  await writeFile(
    new URL(prefix + '-pairs-private.json'),
    JSON.stringify(mappings, null, 2),
  );
  await writeFile(
    new URL(prefix + '-review.json'),
    JSON.stringify(
      {
        sourceHash: fingerprint(report),
        implementationHash: fingerprint(
          await readFile(new URL(import.meta.url), 'utf8'),
        ),
        evaluatorKind: 'unreviewed',
        personallyReviewed: false,
        blind: true,
        items,
      },
      null,
      2,
    ),
  );
  const history = (entries) =>
    entries.length
      ? entries
          .map(
            (entry) =>
              `Pessoa: ${entry.userText || '[iniciativa]'}\n\nAmadeus: ${entry.sentText ?? entry.generatedText}`,
          )
          .join('\n\n')
      : '[Sem histórico]';
  await writeFile(
    new URL(prefix + '-review.md'),
    '# Llama — revisão cega da direção expressiva\n\nOs dois autores são o mesmo Llama. Braço e amostra ocultos; letras variam por item. Avalie interlocução, proporcionalidade, sustentação, continuidade, persona, perguntas e cânone; acrescente gatilho, alvo, intensidade, transição e ritmo. Escolha A/B/empate/nenhum e justifique. Micro pausas e expressões não aprovam sozinhas a persona. Não consulte o mapa privado antes da revisão. Fichas sem notas humanas preenchidas.\n\n' +
      items
        .map(
          (item, index) =>
            `## ${index + 1}. ${item.id}\n\nPessoa agora: ${item.user || '[iniciativa da aplicação]'}\n\n` +
            item.options
              .map(
                (option) =>
                  `### ${option.label}\n\nFatos: ${option.facts.length ? option.facts.join('; ') : '[Nenhum]'}\n\nHistórico:\n\n${history(option.history)}\n\nResposta: ${option.assistant}\n`,
              )
              .join('\n'),
        )
        .join('\n'),
  );
  const coverage = report.cases.filter((item) => item.phase === 'coverage');
  await writeFile(
    new URL(prefix + '-coverage-review.md'),
    '# Cobertura do candidato — Llama\n\nUma amostra por conversa, sem controle: diagnóstico de cobertura, não comparação causal nem aprovação humana. Avaliar cada fala e a transição ao longo da conversa.\n\n' +
      coverage
        .map(
          (item) =>
            `## ${item.id}\n\n` +
            item.turns
              .map(
                (turn, index) =>
                  `### Turno ${index + 1}\n\nHistórico:\n\n${history(turn.history)}\n\nPessoa: ${turn.user || '[iniciativa]'}\n\nAmadeus: ${turn.assistant || '[Sem resposta]'}\n\nErros: ${turn.errors.join(', ') || 'nenhum'}\n`,
              )
              .join('\n'),
        )
        .join('\n'),
  );
  await writeFile(
    new URL(prefix + '-transcription.md'),
    '# Llama — transcrição identificada\n\nDiagnóstico do agente não equivale a revisão humana. Consultar depois das fichas cegas.\n\n' +
      report.cases
        .map(
          (item) =>
            `## ${item.id} / ${item.variant} / amostra ${item.sample} / ${item.phase}\n\n` +
            item.turns
              .map(
                (turn, index) =>
                  `**${index + 1}. Pessoa:** ${turn.user || '[iniciativa]'}\n\n**Amadeus:** ${turn.assistant || '[Sem resposta]'}\n\nErros: ${turn.errors.join(', ') || 'nenhum'}\n`,
              )
              .join('\n'),
        )
        .join('\n'),
  );
  return summary;
}
