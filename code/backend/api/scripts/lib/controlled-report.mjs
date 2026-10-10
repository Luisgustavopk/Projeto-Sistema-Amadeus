import { readFile, writeFile } from 'node:fs/promises';
import {
  fingerprint,
  quantiles,
} from '../../src/evaluation/persona/diagnostics.ts';
import { expressionDeliveryReview } from '../../src/evaluation/persona/controlled-refinement.ts';
import { summarizeThreeModelV3 } from './three-model-v3-report.mjs';

function inspectHeader(turn) {
  const match = /^\s*<expression>(.*?)<\/expression>/su.exec(turn.rawReply);
  if (!match)
    return {
      canonicalHeaderPresent: false,
      eventMetadataValid: turn.expression?.metadataValid ?? false,
    };
  try {
    const value = JSON.parse(match[1]);
    const { memory, ...proposal } = value;
    return {
      canonicalHeaderPresent: true,
      memory,
      rawProposal: proposal,
      review: expressionDeliveryReview(proposal),
      eventMetadataValid: turn.expression?.metadataValid ?? false,
    };
  } catch {
    return {
      canonicalHeaderPresent: true,
      jsonValid: false,
      eventMetadataValid: turn.expression?.metadataValid ?? false,
    };
  }
}

const key = (item) =>
  [
    item.phase,
    item.id,
    item.model?.name ?? item.model,
    item.variant,
    item.sample,
  ].join(':');
const good = (turn) => Boolean(turn.assistant && !turn.errors.length);
function metrics(turns) {
  const validObserver = turns.filter(
    (turn) => turn.expressionObserver?.value && !turn.expressionObserver.error,
  );
  return {
    turns: turns.length,
    firstRawMs: quantiles(turns.map((turn) => turn.firstRawTextMs)),
    firstSpeechMs: quantiles(turns.map((turn) => turn.firstSpeechTextMs)),
    firstUsableMs: quantiles(turns.map((turn) => turn.firstUsableTextMs)),
    authorCompletedMs: quantiles(turns.map((turn) => turn.authorCompletedMs)),
    words: quantiles(turns.map((turn) => turn.diagnostics.words)),
    questionsPerTurn: turns.length
      ? turns.reduce((n, turn) => n + turn.diagnostics.questions, 0) /
        turns.length
      : null,
    validAuthorMetadata: turns.filter((turn) => turn.expression?.metadataValid)
      .length,
    observerAttempts: turns.filter((turn) => turn.expressionObserver).length,
    observerValid: validObserver.length,
    observerLagMs: quantiles(
      validObserver.map(
        (turn) => turn.expressionObserver.completedMs - turn.firstUsableTextMs,
      ),
    ),
    observerBlockingSpeech: false,
    semanticApproval: 'pending-human-review',
  };
}

/** Offline: no model calls, no automatic persona approval, no reading reserved answers to tune. */
export async function reportControlled(directory) {
  const raw = await readFile(
    new URL('persona-controlled.json', directory),
    'utf8',
  );
  const report = JSON.parse(raw);
  if (report.calls.some((call) => call.status === 'pending'))
    throw new Error('Avaliação ainda em andamento.');
  const expected = new Map(
    report.plan.frozen.jobs.map((job) => [
      key({ ...job, id: job.scenario.id }),
      job.scenario.turns.length,
    ]),
  );
  const complete = (item) =>
    item.turns.length === expected.get(key(item)) && item.turns.every(good);
  const phases = {
    output: ['header', 'plain'],
    initiative: ['current', 'final-task'],
    examples: ['fixed', 'contextual'],
  };
  const contrasts = [];
  const review = [
    '# Revisão dos braços isolados — Llama',
    '',
    'Autoria Llama conhecida; braços e parâmetros ocultos. Letras variam por item. Desenvolvimento conhecido: revisão informada, não validação reservada. Cada opção usa seu próprio histórico.',
    '',
    'Avalie gatilho, alvo, intensidade, recomposição, continuidade, interlocução e fidelidade. Ausência de pergunta ou de interjeição pode ser adequada. Julgue a fala antes dos metadados.',
    '',
  ];
  const privateMap = [];
  let index = 0;
  for (const [phase, variants] of Object.entries(phases)) {
    const identities = [
      ...new Set(
        report.plan.frozen.jobs
          .filter((job) => job.phase === phase)
          .map((job) => job.scenario.id + ':' + job.sample),
      ),
    ];
    const pairs = identities
      .map((identity) => {
        const [id, sample] = identity.split(':');
        return variants.map((variant) =>
          report.cases.find(
            (item) =>
              item.phase === phase &&
              item.id === id &&
              item.sample === Number(sample) &&
              item.variant === variant,
          ),
        );
      })
      .filter((pair) => pair.every((item) => item && complete(item)));
    const pairedDeltas = pairs.flatMap(([before, after]) =>
      before.turns.map(
        (turn, i) => after.turns[i].firstUsableTextMs - turn.firstUsableTextMs,
      ),
    );
    contrasts.push({
      phase,
      completePairs: pairs.length,
      pairedFirstUsableDeltaMs: quantiles(pairedDeltas),
      arms: variants.map((variant, i) => ({
        variant,
        ...metrics(pairs.flatMap((pair) => pair[i].turns)),
      })),
      initiativeTurns:
        phase === 'initiative'
          ? variants.map((variant, i) => ({
              variant,
              ...metrics(
                pairs.flatMap((pair) =>
                  pair[i].turns.filter(
                    (turn) => turn.initiativeKind === 'initiative',
                  ),
                ),
              ),
            }))
          : undefined,
    });
    for (const pair of pairs)
      for (let i = 0; i < pair[0].turns.length; i++) {
        index++;
        const id = fingerprint([
          report.plan.fingerprint,
          phase,
          pair[0].id,
          pair[0].sample,
          i,
        ]).slice(0, 12);
        const options = [...pair].sort((a, b) =>
          fingerprint([id, a.variant]).localeCompare(
            fingerprint([id, b.variant]),
          ),
        );
        review.push(
          `## Item ${index} — ${id}`,
          '',
          `**Fala atual:** ${pair[0].turns[i].user || '[evento de iniciativa da aplicação]'}`,
          '',
        );
        privateMap.push({
          id,
          phase,
          scenario: pair[0].id,
          sample: pair[0].sample,
          turn: i + 1,
          options: options.map((item, n) => ({
            label: String.fromCharCode(65 + n),
            variant: item.variant,
          })),
        });
        for (const [n, item] of options.entries()) {
          const turn = item.turns[i];
          review.push(
            `### ${String.fromCharCode(65 + n)}`,
            '',
            '**Histórico desta opção:**',
            '',
            '```json',
            JSON.stringify(
              turn.history.map((entry) => ({
                user: entry.userText,
                assistant: entry.sentText ?? entry.generatedText,
                initiativeKind: entry.initiativeKind,
              })),
              null,
              2,
            ),
            '```',
            '',
            turn.assistant,
            '',
          );
        }
        review.push(
          '**Sua avaliação:**',
          '',
          '- Preferência:',
          '- Gatilho/alvo/intensidade/recomposição:',
          '- Persona e continuidade:',
          '- Motivo:',
          '',
        );
      }
  }
  const ledger = JSON.parse(
    await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
  );
  const aggregate = report.inheritedUsd + ledger.committedUsd;
  const billed = report.calls.reduce(
    (n, call) => n + (call.usage?.cost ?? 0),
    0,
  );
  const unknown = report.calls
    .filter((call) => call.usage?.cost == null)
    .reduce((n, call) => n + call.reservedUsd, 0);
  if (
    aggregate > report.aggregateCapUsd + 1e-8 ||
    Math.abs(billed + unknown - ledger.committedUsd) > 1e-8
  )
    throw new Error('Auditoria financeira divergente.');
  const linked = new Set(
    [...report.cases, ...(report.interruptedCases ?? [])].flatMap((item) =>
      item.turns.flatMap((turn) => turn.callIds ?? []),
    ),
  );
  if (report.calls.some((call) => !linked.has(call.id)))
    throw new Error('Chamada sem ligação ao turno.');
  const output = {
    reportHash: fingerprint(raw),
    analyzerHash: fingerprint(await readFile(new URL(import.meta.url), 'utf8')),
    aggregateCapUsd: report.aggregateCapUsd,
    inheritedUsd: report.inheritedUsd,
    newCommittedUsd: ledger.committedUsd,
    newBilledUsd: billed,
    newUncertainReservedUsd: unknown,
    aggregateCommittedUsd: aggregate,
    remainingUsd: report.aggregateCapUsd - aggregate,
    stopped: report.stopped,
    contrasts,
    coverage: report.plan.frozen.jobs
      .filter((job) => ['coverage', 'reserved'].includes(job.phase))
      .map((job) => ({
        phase: job.phase,
        id: job.scenario.id,
        model: job.model.name,
        complete: report.cases.some(
          (item) =>
            key(item) === key({ ...job, id: job.scenario.id }) &&
            complete(item),
        ),
      })),
    noAudio: true,
    productionChanged: false,
    humanReferenceConfirmed: false,
    expressionAudit: report.cases
      .filter((item) => item.phase !== 'reserved')
      .flatMap((item) =>
        item.turns.map((turn, index) => ({
          phase: item.phase,
          id: item.id,
          model: item.model,
          variant: item.variant,
          sample: item.sample,
          turn: index + 1,
          ...inspectHeader(turn),
        })),
      ),
  };
  await writeFile(
    new URL('controlled-summary.json', directory),
    JSON.stringify(output, null, 2),
  );
  await writeFile(
    new URL('controlled-arms-review.md', directory),
    review.join('\n'),
  );
  await writeFile(
    new URL('controlled-arms-private.json', directory),
    JSON.stringify(privateMap, null, 2),
  );
  const candidates = report.cases
    .filter((item) => item.phase === 'coverage' && complete(item))
    .flatMap((item) =>
      item.turns.map((turn, index) => ({
        item,
        turn,
        index,
        hash: fingerprint([
          report.plan.fingerprint,
          item.id,
          index,
          item.model,
        ]),
      })),
    );
  const calibration = [
    '# Revisão pessoal — 30 respostas sem autoria',
    '',
    'Seleção por hash, sem notas de qualidade. São cenários de desenvolvimento: servem à calibração, não à certificação reservada. As respostas não trazem metadados. Julgue a fala e o histórico antes de abrir as transcrições ou o mapa privado.',
    '',
    'Critérios: interlocução, proporcionalidade, sustentação, continuidade, persona, perguntas; também gatilho, alvo, intensidade e recomposição. Use aprova/reprova/incerto/não aplicável, com motivo.',
    '',
  ];
  const calibrationMap = [];
  const selected = [];
  for (const model of report.plan.frozen.models)
    selected.push(
      ...candidates
        .filter((candidate) => candidate.item.model === model.name)
        .sort((a, b) => a.hash.localeCompare(b.hash))
        .slice(0, 10),
    );
  selected.sort((a, b) => a.hash.localeCompare(b.hash));
  for (const [index, candidate] of selected.entries()) {
    const { item, turn, hash } = candidate;
    calibration.push(
      `## Item ${index + 1} — ${hash.slice(0, 12)}`,
      '',
      `**Fala atual:** ${turn.user || '[iniciativa da aplicação]'}`,
      '',
      '**Histórico:**',
      '',
      '```json',
      JSON.stringify(
        turn.history.map((entry) => ({
          user: entry.userText,
          assistant: entry.sentText ?? entry.generatedText,
        })),
        null,
        2,
      ),
      '```',
      '',
      `**Resposta:** ${turn.assistant}`,
      '',
      '**Sua avaliação:**',
      '',
      '- Interlocução:',
      '- Proporcionalidade:',
      '- Sustentação:',
      '- Continuidade:',
      '- Persona:',
      '- Perguntas:',
      '- Gatilho/alvo/intensidade/recomposição:',
      '- Motivo:',
      '',
    );
    calibrationMap.push({
      id: hash.slice(0, 12),
      model: item.model,
      scenario: item.id,
      turn: candidate.index + 1,
    });
  }
  await writeFile(
    new URL('human-calibration-review.md', directory),
    calibration.join('\n'),
  );
  await writeFile(
    new URL('human-calibration-private.json', directory),
    JSON.stringify(calibrationMap, null, 2),
  );
  return output;
}

/** Offline union of the unchanged emotional candidate; excludes isolated arms and reserved validation. */
export async function reportEmotionalCoverage(directory) {
  const report = JSON.parse(
    await readFile(new URL('persona-controlled.json', directory), 'utf8'),
  );
  const parentRaw = await readFile(
    new URL(
      '../emotional-depth-after-015-2026-10-08/emotional-depth-after.json',
      directory,
    ),
    'utf8',
  );
  if (fingerprint(parentRaw) !== report.plan.frozen.parentHash)
    throw new Error('Origem herdada alterada.');
  const parent = JSON.parse(parentRaw);
  for (const field of [
    'originalCore',
    'card',
    'direction',
    'presence',
    'expressiveDirection',
    'bank',
    'models',
    'temperature',
    'maxTokens',
    'canonicalMemory',
    'outputFormat',
  ]) {
    if (
      fingerprint(parent.plan.frozen[field]) !==
      fingerprint(report.plan.frozen[field])
    )
      throw new Error('Candidato emocional divergente: ' + field);
  }
  const audit = await reportControlled(directory);
  const emotional = report.cases.filter((item) => item.phase === 'coverage');
  const previous = parent.cases.filter((item) => item.variant === 'after');
  const cases = [...previous, ...emotional];
  const keys = cases.map((item) => item.id + ':' + item.model);
  if (new Set(keys).size !== keys.length)
    throw new Error('Conversa duplicada na união emocional.');
  const continuationJobs = report.plan.frozen.jobs.filter(
    (job) => job.phase === 'coverage',
  );
  const scenarioIds = new Set([
    ...previous.map((item) => item.id),
    ...continuationJobs.map((job) => job.scenario.id),
  ]);
  const jobs = parent.plan.frozen.jobs.filter((job) =>
    scenarioIds.has(job.scenario.id),
  );
  for (const job of continuationJobs) {
    const original = jobs.find(
      (entry) =>
        entry.scenario.id === job.scenario.id &&
        entry.model.name === job.model.name,
    );
    if (
      !original ||
      fingerprint(original.scenario) !== fingerprint(job.scenario)
    )
      throw new Error('Cenário da continuação divergente: ' + job.scenario.id);
  }
  const linked = new Set(
    [
      ...cases,
      ...(report.interruptedCases ?? []).filter(
        (item) => item.phase === 'coverage',
      ),
    ].flatMap((item) => item.turns.flatMap((turn) => turn.callIds ?? [])),
  );
  const combined = {
    ...report,
    cases,
    calls: [...parent.calls, ...report.calls].filter((call) =>
      linked.has(call.id),
    ),
    plan: {
      ...report.plan,
      frozen: {
        ...report.plan.frozen,
        jobs,
        scope:
          '24 conversas emocionais novas, candidato after inalterado; união de duas coletas. Exclui braços isolados e validação reservada. Uma amostra por conversa e modelo, sem voz ou aprovação humana.',
      },
      plannedTurns: jobs.reduce((n, job) => n + job.scenario.turns.length, 0),
    },
    budget: {
      roundMaxUsd: report.aggregateCapUsd,
      roundCommittedUsd: audit.aggregateCommittedUsd,
    },
    sourceHashes: {
      parent: fingerprint(parentRaw),
      continuation: audit.reportHash,
    },
  };
  await writeFile(
    new URL('emotional-combined.json', directory),
    JSON.stringify(combined, null, 2),
  );
  const summary = await summarizeThreeModelV3(
    new URL('emotional-combined.json', directory),
    combined,
  );
  const reservedJobs = report.plan.frozen.jobs.filter(
    (job) => job.phase === 'reserved',
  );
  const reserved = {
    ...report,
    cases: report.cases.filter((item) => item.phase === 'reserved'),
    plan: {
      ...report.plan,
      frozen: {
        ...report.plan.frozen,
        jobs: reservedJobs,
        scope:
          'Validação nova: quatro itens sem autoria. Faça sua revisão pessoal antes de abrir transcrições e mapas privados. Sem aprovação automática.',
      },
      plannedTurns: reservedJobs.reduce(
        (n, job) => n + job.scenario.turns.length,
        0,
      ),
    },
  };
  const ids = new Set(
    reserved.cases.flatMap((item) =>
      item.turns.flatMap((turn) => turn.callIds ?? []),
    ),
  );
  reserved.calls = report.calls.filter((call) => ids.has(call.id));
  await summarizeThreeModelV3(new URL('reserved.json', directory), reserved);
  return { audit, summary };
}
