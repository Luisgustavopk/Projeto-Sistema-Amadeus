import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import { JEV_ENDPOINT } from '../src/domain/persona/tone.ts';
import {
  questionsFor,
  payloadFor,
  validateDecision,
  digest,
  decisionConflicts,
} from './lib/acting-jev.mjs';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--run')) throw new Error('Use [--run].');
const directory = new URL(
  '../data/refinement/reactions-v9-015/',
  import.meta.url,
);
const root = new URL('../../evals/persona/quality-v9/', import.meta.url);
const authors = JSON.parse(
  await readFile(new URL('results.json', directory), 'utf8'),
);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', directory), 'utf8'),
);
const ledger = JSON.parse(
  await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
);
if (
  !authors.observersCompletedAt ||
  authors.stopped ||
  authors.manifestHash !== manifest.hash ||
  ledger.manifestHash !== manifest.hash ||
  ledger.maxUsd !== 0.15
)
  throw new Error('AUTHOR_PHASE_INCOMPLETE');
const reference = JSON.parse(
  await readFile(
    new URL(
      '../data/refinement/latency-v8-remainder/owner-reviewed-reference.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const originalPairs = JSON.parse(
  await readFile(
    new URL(
      '../data/refinement/latency-v8-remainder/judge-manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
).frozen.fresh;
const rubric = await readFile(new URL('jev-rubric.md', root), 'utf8');
const questions = questionsFor(rubric);
const controls = JSON.parse(
  await readFile(new URL('jev-controls.json', root), 'utf8'),
).controls.map((control) => ({
  ...control,
  options: {
    A: { context: control.context, reply: control.A },
    B: { context: control.context, reply: control.B },
  },
}));
const diagnosticNumbers = [3, 5, 7, 10, 22, 23, 24, 25];
const diagnostics = reference.pairs
  .filter((item) => diagnosticNumbers.includes(item.number))
  .map((review) => ({
    ...originalPairs.find((item) => item.id === review.id),
    review,
  }));
const fresh = [];
function addPair(first, second, index, group) {
  const options = [first, second].map((item) => ({
    context: item.turns[index].history
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n'),
    reply: item.turns[index].assistant,
  }));
  const id = digest([group, first.key, second.key, index, options]).slice(
    0,
    12,
  );
  const reversed = Number.parseInt(id.slice(0, 2), 16) % 2 === 1;
  const mappings = [
    first.model + ':' + first.arm,
    second.model + ':' + second.arm,
  ];
  fresh.push({
    id,
    group,
    scenario: first.id,
    split: first.split,
    turn: index + 1,
    current: first.turns[index].user,
    options: reversed
      ? { A: options[1], B: options[0] }
      : { A: options[0], B: options[1] },
    privateMapping: reversed
      ? { A: mappings[1], B: mappings[0] }
      : { A: mappings[0], B: mappings[1] },
  });
}
for (const first of authors.cases.filter(
  (item) => item.arm === 'revised' && item.model === 'llama' && item.complete,
)) {
  const second = authors.cases.find(
    (item) =>
      item.id === first.id &&
      item.arm === 'revised' &&
      item.model === 'deepseek' &&
      item.complete,
  );
  if (second)
    first.turns.forEach((_, index) =>
      addPair(first, second, index, 'model-comparison'),
    );
}
for (const first of authors.cases.filter(
  (item) =>
    item.arm === 'control' && item.split === 'reserved' && item.complete,
)) {
  const second = authors.cases.find(
    (item) =>
      item.id === first.id &&
      item.model === first.model &&
      item.arm === 'revised' &&
      item.complete,
  );
  if (second)
    first.turns.forEach((_, index) =>
      addPair(first, second, index, 'example-comparison'),
    );
}
const probes = JSON.parse(
  await readFile(new URL('retrieval-probes.json', directory), 'utf8'),
);
if (
  probes.parentHash !== manifest.hash ||
  !probes.completedAt ||
  probes.stopped ||
  probes.probes.length !== 12
)
  throw new Error('RETRIEVAL_PROBES_INCOMPLETE');
for (const probe of probes.probes) {
  const context = probe.history
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
  const id = digest(['retrieval', probe.id, probe.control, probe.reply]).slice(
    0,
    12,
  );
  const reversed = Number.parseInt(id.slice(0, 2), 16) % 2 === 1;
  const options = [
    { context, reply: probe.control },
    { context, reply: probe.reply },
  ];
  fresh.push({
    id,
    group: 'retrieval-diagnostic',
    scenario: probe.scenario,
    split: 'development-diagnostic',
    turn: probe.turn,
    current: probe.current,
    options: reversed
      ? { A: options[1], B: options[0] }
      : { A: options[0], B: options[1] },
    privateMapping: reversed
      ? {
          A: probe.model + ':rerank-filtered',
          B: probe.model + ':forced-three',
        }
      : {
          A: probe.model + ':forced-three',
          B: probe.model + ':rerank-filtered',
        },
  });
}
const tasks = [
  ...diagnostics.map((item) => ({
    group: 'known-diagnostic',
    item,
    swapped: false,
  })),
  ...controls.map((item) => ({
    group: 'editorial-control',
    item,
    swapped: false,
  })),
  ...['VC01', 'VC02', 'VC04', 'VC07', 'VC08', 'VC10'].map((id) => ({
    group: 'order-check',
    item: controls.find((item) => item.id === id),
    swapped: true,
  })),
  ...fresh.map((item) => ({ group: item.group, item, swapped: false })),
];
const ceiling = tasks.reduce(
  (sum, task) =>
    sum +
    ((Buffer.byteLength(
      JSON.stringify(payloadFor(task.item, questions, task.swapped)),
    ) +
      2048) *
      0.042) /
      1e6,
  0,
);
console.log(
  JSON.stringify({
    run: args.includes('--run'),
    calls: tasks.length,
    conservativeCeilingUsd: ceiling,
    remainingUsd: ledger.maxUsd - ledger.committedUsd,
    sameRoundCapUsd: 0.15,
    freshHumanLabelsAvailable: false,
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
if (ceiling > ledger.maxUsd - ledger.committedUsd)
  throw new Error('BATCH_DOES_NOT_FIT');
const reportPath = new URL('jev.json', directory);
await writeFile(reportPath, '{}', { flag: 'wx' });
const frozen = {
  authorManifestHash: manifest.hash,
  rubric,
  questions,
  diagnostics,
  controls,
  fresh,
  referenceHash: digest(reference),
  retrievalProbesHash: digest(probes),
  runnerHash: digest(await readFile(new URL(import.meta.url), 'utf8')),
};
await writeFile(
  new URL('judge-manifest.json', directory),
  JSON.stringify({ hash: digest(frozen), frozen }, null, 2),
  { flag: 'wx' },
);
await writeFile(
  new URL('judge-blind-inputs.json', directory),
  JSON.stringify(
    tasks.map((task) => ({
      id: task.item.id,
      group: task.group,
      swapped: task.swapped,
      payload: payloadFor(task.item, questions, task.swapped),
    })),
    null,
    2,
  ),
  { flag: 'wx' },
);
const round = await openSharedEvaluationRound(directory, 0.15, manifest.hash);
const report = {
  manifestHash: manifest.hash,
  createdAt: new Date().toISOString(),
  calls: [],
  stopped: null,
  calibrationApproved: false,
  productionChanged: false,
};
const persist = () => round.persist(reportPath, report);
try {
  for (const task of tasks) {
    const payload = payloadFor(task.item, questions, task.swapped);
    const id = `${task.group}:${task.item.id}`;
    const reservedUsd = round.budget.reserve(id, payload, 1, {
      prompt: 0.042,
      completion: 0,
    });
    const call = {
      id,
      itemId: task.item.id,
      group: task.group,
      swapped: task.swapped,
      reservedUsd,
      status: 'pending',
      answers: null,
      usage: null,
      error: null,
    };
    report.calls.push(call);
    await persist();
    const started = performance.now();
    try {
      const response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP_${response.status}`);
      }
      call.raw = await response.text();
      if (Buffer.byteLength(call.raw) > 32768)
        throw new Error('RESPONSE_TOO_LARGE');
      const value = JSON.parse(call.raw);
      if (Number.isFinite(value.usage?.cost) && value.usage.cost >= 0)
        call.usage = value.usage;
      call.answers = validateDecision(value, questions);
      call.audit = decisionConflicts(call.answers);
      if (!call.usage) throw new Error('USAGE_MISSING');
      call.status = 'completed';
    } catch (error) {
      call.status = 'failed';
      call.error = error.message;
      report.stopped = error.message;
    } finally {
      call.durationMs = performance.now() - started;
      round.budget.settle(id, call.usage?.cost);
      await persist();
    }
    console.log(
      JSON.stringify({
        complete: report.calls.length,
        total: tasks.length,
        committedUsd: round.snapshot().roundCommittedUsd,
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
