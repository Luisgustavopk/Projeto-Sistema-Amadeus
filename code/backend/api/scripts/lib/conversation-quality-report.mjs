import {
  approvalRates,
  fingerprint,
  quantiles,
} from '../../src/evaluation/persona/diagnostics.ts';
import { parseVerdict } from '../../src/evaluation/persona/judge.ts';

/** Local post-processing: makes no provider calls and never changes a verdict. */
export function summarizeQualityReport(report, scenarios) {
  let normalizedVerdicts = 0;
  for (const item of report.cases) {
    for (const turn of item.turns) {
      if (!turn.verdict && turn.rawVerdict) {
        try {
          turn.verdict = parseVerdict(turn.rawVerdict);
          turn.verdictRepresentationNormalized = true;
          delete turn.judgeError;
          normalizedVerdicts++;
        } catch {
          /* Invalid judgments remain unknown. */
        }
      }
    }
  }
  report.normalizedVerdicts =
    (report.normalizedVerdicts ?? 0) + normalizedVerdicts;
  report.completedTurns = report.cases
    .flatMap((item) => item.turns)
    .filter((turn) => turn.assistant && !turn.errors.length).length;
  const cells = report.models.flatMap((model) =>
    report.variants.map((variant) => ({ model, variant })),
  );
  report.summary = cells.map((cell) => {
    const cases = report.cases.filter(
      (item) => item.model === cell.model && item.variant === cell.variant,
    );
    const turns = cases.flatMap((item) => item.turns);
    const callIds = new Set(turns.flatMap((turn) => turn.callIds ?? []));
    const calls = report.calls.filter((call) => callIds.has(call.id));
    const providerDistribution = {};
    for (const call of calls) {
      const provider = call.provider ?? 'unreported';
      providerDistribution[provider] =
        (providerDistribution[provider] ?? 0) + 1;
    }
    const completed = turns.filter(
      (turn) => turn.assistant && !turn.errors.length,
    );
    const diagnostics = completed.flatMap((turn) =>
      turn.diagnostics ? [turn.diagnostics] : [],
    );
    return {
      ...cell,
      conversations: cases.length,
      completeConversations: cases.filter(
        (item) =>
          item.turns.length ===
            scenarios.find((scenario) => scenario.id === item.id)?.turns
              .length &&
          item.turns.every((turn) => turn.assistant && !turn.errors.length),
      ).length,
      attemptedTurns: turns.length,
      completedTurns: completed.length,
      errorTurns: turns.filter((turn) => turn.errors.length).length,
      generations: calls.length,
      providerDistribution,
      systemCharacters: quantiles(
        calls.map((call) => call.request.messages[0]?.content.length ?? 0),
      ),
      inputTokens: calls.reduce(
        (sum, call) => sum + (call.usage?.prompt_tokens ?? 0),
        0,
      ),
      outputTokens: calls.reduce(
        (sum, call) => sum + (call.usage?.completion_tokens ?? 0),
        0,
      ),
      cachedInputTokens: calls.reduce(
        (sum, call) =>
          sum + (call.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        0,
      ),
      cacheReportedGenerations: calls.filter(
        (call) =>
          call.usage?.prompt_tokens_details?.cached_tokens !== undefined,
      ).length,
      formatRecoveries: cases.reduce(
        (sum, item) => sum + (item.metrics?.personaRecoveries ?? 0),
        0,
      ),
      judgedTurns: turns.filter((turn) => turn.verdict).length,
      rates: approvalRates(turns),
      words: quantiles(diagnostics.map((item) => item.words)),
      questionsPerTurn: diagnostics.length
        ? diagnostics.reduce((sum, item) => sum + item.questions, 0) /
          diagnostics.length
        : null,
      distinctOpeningRatio: diagnostics.length
        ? new Set(diagnostics.map((item) => item.opening)).size /
          diagnostics.length
        : null,
      literalCopies: diagnostics.filter(
        (item) => item.exampleCopy.matched.length,
      ).length,
      recentRepetitions: diagnostics.filter(
        (item) => item.recentCopy.matched.length,
      ).length,
      firstRawTextMs: quantiles(
        completed.flatMap((turn) =>
          turn.firstRawTextMs === undefined ? [] : [turn.firstRawTextMs],
        ),
      ),
      firstSpeechTextMs: quantiles(
        completed.flatMap((turn) =>
          turn.firstSpeechTextMs === undefined ? [] : [turn.firstSpeechTextMs],
        ),
      ),
      firstUsableTextMs: quantiles(
        completed.flatMap((turn) =>
          turn.firstUsableTextMs === undefined ? [] : [turn.firstUsableTextMs],
        ),
      ),
      totalMs: quantiles(completed.map((turn) => turn.totalMs)),
      attemptedTotalMs: quantiles(turns.map((turn) => turn.totalMs)),
      byConversation: scenarios
        .filter((scenario) => cases.some((item) => item.id === scenario.id))
        .map((scenario) => ({
          id: scenario.id,
          rates: approvalRates(
            cases
              .filter((item) => item.id === scenario.id)
              .flatMap((item) => item.turns),
          ),
        })),
    };
  });
  const candidates = report.cases.flatMap((item) =>
    item.turns
      .map((turn, index) => ({ item, turn, index }))
      .filter(({ turn }) => turn.verdict),
  );
  // Round-robin cells prevents thirty labels being drawn from just one author.
  const pools = cells.map((cell) =>
    candidates
      .filter(
        ({ item }) =>
          item.model === cell.model && item.variant === cell.variant,
      )
      .toSorted((a, b) =>
        fingerprint([a.item.id, a.item.sample, a.index]).localeCompare(
          fingerprint([b.item.id, b.item.sample, b.index]),
        ),
      ),
  );
  const selected = [];
  if (report.calibrationIds) {
    for (const id of report.calibrationIds) {
      const candidate = candidates.find(
        ({ item, index }) =>
          fingerprint([
            report.createdAt,
            item.id,
            item.sample,
            item.model,
            item.variant,
            index,
          ]).slice(0, 12) === id,
      );
      if (!candidate)
        throw new Error('Turno de calibração congelado sem veredito.');
      selected.push(candidate);
    }
  }
  while (
    !report.calibrationIds &&
    selected.length < 30 &&
    pools.some((pool) => pool.length)
  ) {
    for (const pool of pools) {
      if (selected.length >= 30) break;
      if (pool.length) selected.push(pool.shift());
    }
  }
  const calibration = {
    calibrated: false,
    instructions:
      'Avalie antes de consultar vereditos automáticos. Preencha humanChecks com os oito critérios: applicable, pass e evidence. Não há aprovação humana registrada.',
    turns: selected.map(({ item, turn, index }) => ({
      blindId: fingerprint([
        report.createdAt,
        item.id,
        item.sample,
        item.model,
        item.variant,
        index,
      ]).slice(0, 12),
      expectation: item.expectation,
      user: turn.user,
      initiativeKind: turn.initiativeKind,
      history: turn.history,
      facts: turn.facts,
      assistant: turn.assistant,
      humanChecks: null,
    })),
  };
  report.calibrationIds = calibration.turns.map((turn) => turn.blindId);
  const markdown =
    [
      '# Avaliação textual independente — rodada inicial',
      `Conjunto: ${report.split}. ${report.completedTurns}/${report.plannedTurns} turnos concluídos. Teto total: US$ ${report.budget.roundMaxUsd}. Contabilizado: US$ ${report.budget.roundCommittedUsd.toFixed(6)}. Parada: ${report.stopped ?? 'rodada concluída'}.`,
      ...report.limitations,
      '| Modelo | Variante | Conversas completas | Turnos julgados | Palavras p50 | Perguntas/turno | Primeiro texto utilizável p50 (ms) | Total p50 (ms) |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...report.summary.map(
        (item) =>
          `| ${item.model} | ${item.variant} | ${item.completeConversations} | ${item.judgedTurns} | ${item.words.p50 ?? '—'} | ${item.questionsPerTurn?.toFixed(2) ?? '—'} | ${item.firstUsableTextMs.p50 === null ? '—' : Math.round(item.firstUsableTextMs.p50)} | ${item.totalMs.p50 === null ? '—' : Math.round(item.totalMs.p50)} |`,
      ),
      ...report.summary.flatMap((item) => [
        `## Critérios · ${item.model}/${item.variant}`,
        '| Critério | Aprovações | Falhas | Indefinidos | Não aplicável | Taxa nos definidos |',
        '| --- | ---: | ---: | ---: | ---: | ---: |',
        ...Object.entries(item.rates).map(
          ([criterion, value]) =>
            `| ${criterion} | ${value.passed} | ${value.failed} | ${value.unknown} | ${value.notApplicable} | ${value.rate === null ? '—' : (value.rate * 100).toFixed(1) + '%'} |`,
        ),
      ]),
      ...report.cases.flatMap((item) => [
        `## ${item.id} · ${item.model}/${item.variant} · amostra ${item.sample}`,
        ...item.turns.flatMap((turn) => [
          `Participante: ${turn.initiativeKind ?? turn.user}`,
          `Amadeus: ${turn.assistant || '(falha)'}`,
          `Juiz: ${turn.verdict?.summary ?? turn.judgeError ?? 'sem veredito'}`,
        ]),
      ]),
    ].join('\n\n') + '\n';
  return {
    markdown,
    calibration,
    calibrationMarkdown: renderCalibration(calibration),
  };
}

export function renderCalibration(calibration) {
  return (
    [
      '# Revisão humana cega — 30 turnos',
      'Autor, variante e nota automática foram ocultados. Use o código de cada item para enviar sua avaliação no chat, ou preencha humanChecks na ficha JSON. Este Markdown é gerado para leitura.',
      'Critérios: interlocução (sem atendimento genérico); proporcionalidade; sustentação factual; continuidade; persona; função das perguntas; coerência das recomendações; cânone. Use aprova, reprova, não aplicável ou incerto, citando o motivo.',
      ...calibration.turns.flatMap((turn, index) => [
        `## ${index + 1}. ${turn.blindId}`,
        `Expectativa: ${turn.expectation}`,
        ...(turn.facts.length
          ? [
              `Fatos disponíveis: ${turn.facts.map((fact) => fact.text).join(' ')}`,
            ]
          : []),
        ...turn.history.flatMap((item) => [
          `Anterior — participante: ${item.initiativeKind ?? item.userText}`,
          `Anterior — Amadeus: ${item.sentText}`,
        ]),
        `Agora — participante: ${turn.initiativeKind ?? turn.user}`,
        `Resposta avaliada: ${turn.assistant}`,
      ]),
    ].join('\n\n') + '\n'
  );
}
