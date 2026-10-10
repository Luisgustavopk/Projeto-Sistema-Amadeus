import { readFile, writeFile } from 'node:fs/promises';
import {
  fingerprint,
  quantiles,
} from '../src/evaluation/persona/diagnostics.ts';

const directory = new URL(
  '../data/refinement/reactions-v9-015/',
  import.meta.url,
);
const read = async (name) =>
  JSON.parse(await readFile(new URL(name, directory), 'utf8'));
const result = await read('results.json');
const ledger = await read('quality-v2-1-budget.json');
const manifest = await read('manifest.json');
if (
  result.manifestHash !== manifest.hash ||
  ledger.manifestHash !== manifest.hash ||
  ledger.maxUsd !== 0.15
)
  throw new Error('REPORT_MANIFEST_MISMATCH');
const stats = quantiles;
const counts = (values) =>
  Object.fromEntries(
    [...new Set(values)].map((value) => [
      value,
      values.filter((item) => item === value).length,
    ]),
  );
const formatContext = (history) =>
  history.length
    ? history
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n\n')
    : '(Sem histórico anterior.)';
const summary = {
  capUsd: 0.15,
  committedUsd: ledger.committedUsd,
  remainingUsd: 0.15 - ledger.committedUsd,
  completeConversations: result.cases.filter((item) => item.complete).length,
  authorCalls: result.calls.filter((call) => call.purpose.startsWith('author:'))
    .length,
  observerCalls: result.calls.filter((call) =>
    call.purpose.startsWith('observer:'),
  ).length,
  failedCalls: result.calls
    .filter((call) => call.status !== 'completed')
    .map((call) => ({ purpose: call.purpose, error: call.error })),
  noAudio: true,
  productionChanged: false,
  actors: {},
  observers: {},
};
for (const model of ['llama', 'deepseek'])
  for (const arm of ['control', 'revised']) {
    const turns = result.cases
      .filter(
        (item) => item.model === model && item.arm === arm && item.complete,
      )
      .flatMap((item) => item.turns);
    summary.actors[`${model}:${arm}`] = {
      turns: turns.length,
      words: stats(turns.map((turn) => turn.diagnostics.words)),
      sentences: stats(turns.map((turn) => turn.diagnostics.sentences)),
      questionsPerTurn:
        turns.reduce(
          (sum, turn) => sum + (turn.assistant.match(/\?/gu)?.length ?? 0),
          0,
        ) / turns.length,
      firstRawMs: stats(turns.map((turn) => turn.firstRawTextMs)),
      generationMs: stats(turns.map((turn) => turn.generationMs)),
      first700Ms: stats(
        turns.map((turn) => turn.segmentations[700].firstUsableMs),
      ),
      first200Ms: stats(
        turns.map((turn) => turn.segmentations[200].firstUsableMs),
      ),
      pairedSavingMs: stats(
        turns.map(
          (turn) =>
            turn.segmentations[700].firstUsableMs -
            turn.segmentations[200].firstUsableMs,
        ),
      ),
      equivalentText: turns.filter((turn) => turn.equivalentText).length,
      totalSegments700: turns.reduce(
        (sum, turn) => sum + turn.segmentations[700].segments.length,
        0,
      ),
      totalSegments200: turns.reduce(
        (sum, turn) => sum + turn.segmentations[200].segments.length,
        0,
      ),
      retrievalPreparationMs: stats(
        turns.map((turn) => turn.selection.preparationMs),
      ),
      firstSegmentsWithoutTerminalPunctuation700: turns.filter(
        (turn) =>
          !/[.!?…]["”]?$/u.test(
            turn.segmentations[700].segments[0]?.text ?? '',
          ),
      ).length,
      firstSegmentsWithoutTerminalPunctuation200: turns.filter(
        (turn) =>
          !/[.!?…]["”]?$/u.test(
            turn.segmentations[200].segments[0]?.text ?? '',
          ),
      ).length,
      exampleCopies: turns.filter(
        (turn) => turn.diagnostics.exampleCopy.matched.length,
      ).length,
    };
    if (arm !== 'revised') continue;
    for (const name of ['control', 'anchored']) {
      const observations = turns
        .map((turn) => turn.observers?.[name])
        .filter(Boolean);
      const valid = observations.filter((observation) => observation.valid);
      summary.observers[`${model}:${name}`] = {
        total: observations.length,
        valid: valid.length,
        invalid: observations.length - valid.length,
        halfIntensity: valid.filter(
          (observation) => observation.proposal.intensity === 0.5,
        ).length,
        emotions: counts(
          valid.map((observation) => observation.proposal.emotion),
        ),
        intents: counts(
          valid.map((observation) => observation.proposal.intent),
        ),
        intensity: stats(
          valid.map((observation) => observation.proposal.intensity),
        ),
        durationMs: stats(
          observations.map((observation) => observation.durationMs),
        ),
      };
    }
  }
let judge;
try {
  judge = await read('jev.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (judge) {
  const judgeManifest = await read('judge-manifest.json');
  if (
    judgeManifest.frozen.authorManifestHash !== result.manifestHash ||
    judge.manifestHash !== result.manifestHash
  )
    throw new Error('JUDGE_MANIFEST_MISMATCH');
  const calls = judge.calls.filter((call) => call.status === 'completed');
  const known = calls.filter((call) => call.group === 'known-diagnostic');
  const diagnostics = judgeManifest.frozen.diagnostics;
  const controls = judgeManifest.frozen.controls;
  const controlCalls = calls.filter(
    (call) => call.group === 'editorial-control',
  );
  summary.jev = {
    calls: judge.calls.length,
    completed: calls.length,
    freshHumanReference: false,
    calibrationApproved: false,
    knownDiagnostic: {
      compared: known.length,
      matches: known.filter(
        (call) =>
          call.answers.preference.choice ===
          diagnostics.find((item) => item.id === call.itemId).review.preference,
      ).length,
      disagreements: known
        .filter(
          (call) =>
            call.answers.preference.choice !==
            diagnostics.find((item) => item.id === call.itemId).review
              .preference,
        )
        .map((call) => call.itemId),
    },
    editorialControls: {
      compared: controlCalls.length,
      matches: controlCalls.filter(
        (call) =>
          call.answers.preference.choice ===
          controls.find((control) => control.id === call.itemId).expected,
      ).length,
      disagreements: controlCalls
        .filter(
          (call) =>
            call.answers.preference.choice !==
            controls.find((control) => control.id === call.itemId).expected,
        )
        .map((call) => ({
          id: call.itemId,
          expected: controls.find((control) => control.id === call.itemId)
            .expected,
          actual: call.answers.preference.choice,
        })),
    },
    orderChecks: {},
    conflictIds: calls
      .filter((call) => call.audit.requiresReview)
      .map((call) => call.id),
    freshPreferences: {},
  };
  const inverted = calls.filter((call) => call.group === 'order-check');
  summary.jev.orderChecks = {
    compared: inverted.length,
    stable: inverted.filter((call) => {
      const previous = controlCalls.find((item) => item.itemId === call.itemId)
        .answers.preference.choice;
      const mapped =
        call.answers.preference.choice === 'A'
          ? 'B'
          : call.answers.preference.choice === 'B'
            ? 'A'
            : call.answers.preference.choice;
      return previous === mapped;
    }).length,
  };
  for (const group of [
    'model-comparison',
    'example-comparison',
    'retrieval-diagnostic',
  ])
    summary.jev.freshPreferences[group] = counts(
      calls
        .filter((call) => call.group === group)
        .map(
          (call) =>
            judgeManifest.frozen.fresh.find((item) => item.id === call.itemId)
              .privateMapping[call.answers.preference.choice] ??
            call.answers.preference.choice,
        ),
    );
}

const allCards = [];
for (const scenario of [
  ...manifest.frozen.suite.development,
  ...manifest.frozen.suite.reserved,
])
  for (const [index, user] of scenario.turns.entries()) {
    const options = result.cases
      .filter((item) => item.id === scenario.id && item.complete)
      .map((item) => ({
        model: item.model,
        arm: item.arm,
        history: item.turns[index].history,
        reply: item.turns[index].assistant,
        selected: item.turns[index].selection.ids,
      }));
    if (options.length !== 4) continue;
    const id = fingerprint([scenario.id, index, options]).slice(0, 12);
    const offset = Number.parseInt(id.slice(0, 2), 16) % 4;
    const rotated = options.slice(offset).concat(options.slice(0, offset));
    allCards.push({
      id,
      scenario: scenario.id,
      turn: index + 1,
      current: user,
      options: Object.fromEntries(
        rotated.map((option, i) => ['ABCD'[i], option]),
      ),
    });
  }
let blind =
  '# Revisão textual completa — v9\n\n26 itens, quatro opções por item: os dois autores e os dois bancos de exemplos. Letras variam por item; cada opção tem histórico próprio. Não é calibração humana até ser preenchida e revisada.\n';
for (const [index, card] of allCards.entries()) {
  blind += `\n## Item ${index + 1} — ${card.id}\n\nPessoa: ${card.current}\n`;
  for (const [side, option] of Object.entries(card.options))
    blind += `\n### ${side}\n\nHistórico:\n\n${formatContext(option.history)}\n\nResposta: ${option.reply}\n\nAdequação: __ · Persona: __ · Expressividade: __ · Continuidade: __\n`;
  blind += '\nPreferência: __ · Motivo: __\n';
}
let expressions =
  '# Expressões e transições — v9\n\nCompare cada proposta ao trecho efetivamente observado e ao histórico. A resposta completa aparece para contraste de escopo. O classificador foi avaliado separadamente da geração; a duração não representa atraso adicionado à fala. Julgue a evolução entre turnos, sem exigir irritação ou variação em todos.\n';
let expressionIndex = 0;
const privateExpressions = [];
for (const item of result.cases.filter(
  (candidate) => candidate.arm === 'revised' && candidate.complete,
))
  for (const [index, turn] of item.turns.entries()) {
    if (!turn.observers) continue;
    const id = fingerprint([item.key, index, turn.observers]).slice(0, 12);
    const names =
      Number.parseInt(id.slice(0, 2), 16) % 2
        ? ['anchored', 'control']
        : ['control', 'anchored'];
    const options = {};
    expressions += `\n## Item ${++expressionIndex} — ${id}\n\nPessoa: ${turn.user}\n\nHistórico real:\n\n${formatContext(turn.history)}\n\n**Trecho recebido pelo classificador:** ${turn.observers.control.input.speech}\n\nResposta completa: ${turn.assistant}\n`;
    for (const [offset, name] of names.entries()) {
      const side = 'AB'[offset];
      const previous =
        item.turns[index - 1]?.observers?.[name]?.proposal ?? null;
      options[side] = {
        variant: name,
        proposal: turn.observers[name].proposal,
        previous,
        durationMs: turn.observers[name].durationMs,
      };
      expressions += `\n### ${side}\n\nProposta: ${JSON.stringify(turn.observers[name].proposal)}\n\nProposta do turno anterior: ${JSON.stringify(previous)}\n\nIntenção adequada: __ · Emoção adequada: __ · Intensidade proporcional: __ · Transição adequada: __\n`;
    }
    privateExpressions.push({
      id,
      scenario: item.id,
      model: item.model,
      turn: index + 1,
      options,
    });
  }
let transcripts = '# Transcrições identificadas — v9\n';
for (const item of result.cases) {
  transcripts += `\n## ${item.id} · ${item.model} · ${item.arm} · ${item.split}\n`;
  for (const turn of item.turns)
    transcripts += `\nPessoa: ${turn.user}\n\nAmadeus: ${turn.assistant}\n\nExemplos: ${turn.selection.ids.join(', ')}\n\nPrimeiro texto 700 ms / 200 ms: ${turn.segmentations[700].firstUsableMs} / ${turn.segmentations[200].firstUsableMs}\n\nObservações: ${JSON.stringify(turn.observers ?? {})}\n`;
}
let probes;
try {
  probes = await read('retrieval-probes.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (probes) {
  const audit = await read('retrieval-audit.json');
  if (
    probes.parentHash !== result.manifestHash ||
    audit.parentHash !== result.manifestHash
  )
    throw new Error('RETRIEVAL_MANIFEST_MISMATCH');
  summary.retrieval = {
    diagnosticOnly: true,
    paidProbeCalls: probes.calls.length,
    localRankedTurns: audit.items.length,
    emptySelections: audit.items.filter((item) => !item.selectedIds.length)
      .length,
    warmedDurationMs: stats(
      audit.items.slice(1).map((item) => item.durationMs),
    ),
    coldDurationMs: audit.items[0].durationMs,
  };
}
if (judge) {
  const fresh = (await read('judge-manifest.json')).frozen.fresh;
  for (const [group, filename, title] of [
    [
      'model-comparison',
      'ficha-pos-ajustes.md',
      'Somente após os ajustes: Llama e DeepSeek',
    ],
    [
      'retrieval-diagnostic',
      'ficha-recuperacao-diagnostico.md',
      'Diagnóstico de recuperação: históricos idênticos',
    ],
  ]) {
    let sheet = `# ${title}\n\nLetras variam por item. A ficha não contém autoria, decisões do Jev ou notas pré-preenchidas. Histórico e texto devem ser avaliados antes de consultar as transcrições identificadas.\n`;
    for (const [index, item] of fresh
      .filter((item) => item.group === group)
      .entries()) {
      sheet += `\n## Item ${index + 1} — ${item.id}\n\nPessoa: ${item.current}\n`;
      for (const [side, option] of Object.entries(item.options))
        sheet += `\n### ${side}\n\nHistórico:\n\n${option.context || '(Sem histórico anterior.)'}\n\nResposta: ${option.reply}\n\nAdequação: __ · Persona: __ · Expressividade: __ · Continuidade: __\n`;
      sheet += '\nPreferência: __ · Motivo: __\n';
    }
    await writeFile(new URL(filename, directory), sheet);
  }
}
summary.postprocessing = {
  remoteCalls: 0,
  runnerHash: fingerprint(await readFile(new URL(import.meta.url), 'utf8')),
};
await writeFile(
  new URL('summary.json', directory),
  JSON.stringify(summary, null, 2),
);
await writeFile(
  new URL('all-cards-private.json', directory),
  JSON.stringify(allCards, null, 2),
);
await writeFile(
  new URL('expressions-private.json', directory),
  JSON.stringify(privateExpressions, null, 2),
);
await writeFile(new URL('ficha-cega-completa.md', directory), blind);
await writeFile(
  new URL('ficha-expressoes-transicoes.md', directory),
  expressions,
);
await writeFile(new URL('transcricoes-completas.md', directory), transcripts);
console.log(JSON.stringify(summary, null, 2));
