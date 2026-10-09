import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createLocalMemoryReranker } from '../src/adapters/embeddings/reranker.ts';
import { groupedActingMessages } from '../src/evaluation/persona/sequence-selection.ts';
import { createEvaluationRouter } from '../src/evaluation/persona/router.ts';
import { createPinnedEvaluationFetch } from '../src/evaluation/persona/pinned-fetch.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import {
  fingerprint,
  textDiagnostics,
} from '../src/evaluation/persona/diagnostics.ts';

const args = process.argv.slice(2);
if (args.some((arg) => !['--audit', '--run'].includes(arg)))
  throw new Error('Use [--audit] or [--run].');
const directory = new URL(
  '../data/refinement/reactions-v9-015/',
  import.meta.url,
);
const read = async (name) =>
  JSON.parse(await readFile(new URL(name, directory), 'utf8'));
const manifest = await read('manifest.json');
const authors = await read('results.json');
if (
  !authors.observersCompletedAt ||
  authors.stopped ||
  authors.manifestHash !== manifest.hash
)
  throw new Error('MAIN_PHASE_INCOMPLETE');
const bank = JSON.parse(
  await readFile(
    new URL(
      '../../evals/persona/quality-v7/shots-sequences.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
if (
  fingerprint(JSON.stringify(bank)) !==
  manifest.frozen.resourceHashes['quality-v7/shots-sequences.json']
) {
  // The frozen resource hash covers its exact text, not a reserialization.
  const raw = await readFile(
    new URL(
      '../../evals/persona/quality-v7/shots-sequences.json',
      import.meta.url,
    ),
    'utf8',
  );
  if (
    fingerprint(raw) !==
    manifest.frozen.resourceHashes['quality-v7/shots-sequences.json']
  )
    throw new Error('SOURCE_BANK_CHANGED');
}
const reranker = createLocalMemoryReranker(
  process.env.MEMORY_MODEL_CACHE_DIRECTORY ??
    fileURLToPath(new URL('../data/models/', import.meta.url)),
);
const auditPath = new URL('retrieval-audit.json', directory);
if (args.includes('--audit')) {
  const audit = {
    parentHash: manifest.hash,
    reranker: reranker.key,
    localOnly: true,
    functions: manifest.frozen.functions,
    items: [],
  };
  try {
    for (const scenario of manifest.frozen.suite.development)
      for (const [index, user] of scenario.turns.entries()) {
        const query =
          scenario.turns.slice(Math.max(0, index - 2), index).join('\n') +
          '\nFala atual: ' +
          user;
        const started = performance.now();
        const scores = await reranker.rank(
          query,
          manifest.frozen.functions.map((reference) => reference.description),
        );
        const ranked = manifest.frozen.functions
          .map((reference, offset) => ({
            id: reference.id,
            relevance: scores[offset],
          }))
          .sort((a, b) => b.relevance - a.relevance);
        const selected = ranked
          .filter(
            (item) =>
              item.relevance >= 0.15 &&
              item.relevance >= ranked[0].relevance - 0.15,
          )
          .slice(0, 3);
        audit.items.push({
          scenario: scenario.id,
          turn: index + 1,
          user,
          query,
          durationMs: performance.now() - started,
          ranked,
          selectedIds: selected.map((item) => item.id),
        });
      }
    await writeFile(auditPath, JSON.stringify(audit, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(audit, null, 2));
  } finally {
    await reranker.close();
  }
  process.exit(0);
}
await reranker.close();
const audit = await read('retrieval-audit.json');
if (audit.parentHash !== manifest.hash)
  throw new Error('AUDIT_PARENT_MISMATCH');
const targets = [
  ['V01', 5],
  ['V02', 1],
  ['V02', 2],
  ['V03', 1],
  ['V04', 1],
  ['V04', 3],
];
const tasks = targets.flatMap(([scenario, turnNumber]) =>
  authors.cases
    .filter(
      (item) => item.id === scenario && item.arm === 'revised' && item.complete,
    )
    .map((item) => ({
      item,
      index: turnNumber - 1,
      selected: audit.items.find(
        (selection) =>
          selection.scenario === scenario && selection.turn === turnNumber,
      ),
    })),
);
console.log(
  JSON.stringify({
    run: args.includes('--run'),
    calls: tasks.length,
    sameRoundCapUsd: 0.15,
    selectionOnly: true,
    actualHistoriesIdenticalToControl: true,
    validationSplit: 'development-diagnostic',
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
const path = new URL('retrieval-probes.json', directory);
const report = {
  parentHash: manifest.hash,
  calls: [],
  probes: [],
  stopped: null,
  productionChanged: false,
};
await writeFile(path, '{}', { flag: 'wx' });
const frozen = {
  parentHash: manifest.hash,
  auditHash: fingerprint(audit),
  targets,
  runnerHash: fingerprint(await readFile(new URL(import.meta.url), 'utf8')),
  newValidationClaim: false,
};
await writeFile(
  new URL('retrieval-probes-manifest.json', directory),
  JSON.stringify({ hash: fingerprint(frozen), frozen }, null, 2),
  { flag: 'wx' },
);
const round = await openSharedEvaluationRound(directory, 0.15, manifest.hash);
const persist = () => round.persist(path, report);
const router = createEvaluationRouter({
  key: process.env.OPENROUTER_API_KEY,
  budget: round.budget,
  calls: report.calls,
  persist,
  fetcher: createPinnedEvaluationFetch({
    models: manifest.frozen.models,
    calls: report.calls,
    persist,
  }),
});
try {
  for (const task of tasks) {
    const previous = task.item.turns[task.index];
    const examples = task.selected.selectedIds.map((id) => ({
      id,
      description: manifest.frozen.functions.find(
        (reference) => reference.id === id,
      ).description,
      messages:
        manifest.frozen.scenes.scenes[id] ??
        bank.shots.find((shot) => shot.id === id).messages,
    }));
    const messages = groupedActingMessages({
      system: previous.messages[0].content,
      history: previous.history,
      user: previous.user,
      examples,
    });
    const probe = {
      id: `${task.item.key}:${task.index}`,
      scenario: task.item.id,
      model: task.item.model,
      turn: task.index + 1,
      current: previous.user,
      history: previous.history,
      control: previous.assistant,
      selectedIds: task.selected.selectedIds,
      messages,
      reply: '',
      error: null,
    };
    report.probes.push(probe);
    try {
      for await (const chunk of router.stream(
        manifest.frozen.models.find((model) => model.name === task.item.model),
        messages,
        512,
        `retrieval-probe:${probe.id}`,
        AbortSignal.timeout(45000),
      ))
        probe.reply += chunk.content;
      probe.diagnostics = textDiagnostics(
        probe.reply,
        examples.flatMap((example) =>
          example.messages
            .filter((message) => message.role === 'assistant')
            .map((message) =>
              message.content.replace(
                /^<expression>.*?<\/expression>\s*/su,
                '',
              ),
            ),
        ),
        previous.history
          .filter((message) => message.role === 'assistant')
          .map((message) => message.content),
      );
    } catch (error) {
      probe.error = error.message;
      report.stopped = error.message;
    }
    await persist();
    console.log(
      JSON.stringify({
        scenario: probe.scenario,
        model: probe.model,
        turn: probe.turn,
        selected: probe.selectedIds,
        cost: round.snapshot().roundCommittedUsd,
        error: probe.error,
      }),
    );
    if (report.stopped) break;
  }
} finally {
  report.completedAt = new Date().toISOString();
  try {
    await persist();
  } finally {
    await round.close();
  }
}
if (report.stopped) process.exitCode = 1;
