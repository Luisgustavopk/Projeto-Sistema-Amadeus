import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import { JEV_ENDPOINT } from '../src/domain/persona/tone.ts';
import {
  questionsFor,
  payloadFor,
  freshPairs,
  validateDecision,
  digest,
  decisionConflicts,
} from './lib/acting-jev.mjs';
import {
  preferenceAgreement,
  criterionAgreement,
  remapPreference,
} from './lib/jev-calibration.mjs';

const args = process.argv.slice(2);
if (
  args.some((a) => !['--run', '--budget=0.27'].includes(a)) ||
  !args.includes('--budget=0.27')
)
  throw new Error('Use --budget=0.27 [--run].');
const directory = new URL(
  '../data/refinement/acting-sequences-027-2026-10-08/',
  import.meta.url,
);
const root = new URL('../../evals/persona/quality-v7/', import.meta.url);
const authors = JSON.parse(
  await readFile(new URL('authors.json', directory), 'utf8'),
);
if (!authors.completedAt || authors.stopped)
  throw new Error('Autores precisam terminar antes do juiz.');
const ledger = JSON.parse(
  await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
);
if (ledger.maxUsd !== 0.27 || authors.manifestHash !== ledger.manifestHash)
  throw new Error('LEDGER_MISMATCH');
const known = JSON.parse(
  await readFile(
    new URL(
      '../data/refinement/jev-calibration-owner-2026-10-08/calibration-reference.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const controls = JSON.parse(
  await readFile(new URL('jev-controls.json', root), 'utf8'),
).controls.map((c) => ({
  ...c,
  options: {
    A: { context: c.context, reply: c.A },
    B: { context: c.context, reply: c.B },
  },
}));
const rubric = await readFile(new URL('jev-rubric.md', root), 'utf8');
const questions = questionsFor(rubric);
const fresh = freshPairs(authors);
const base = [
  ...known.owner.map((item) => ({ group: 'owner', item, swapped: false })),
  ...controls.map((item) => ({ group: 'control', item, swapped: false })),
  ...fresh.map((item) => ({ group: 'fresh', item, swapped: false })),
];
const swaps = [...controls]
  .sort((a, b) => digest(a.id).localeCompare(digest(b.id)))
  .slice(0, 8)
  .map((item) => ({ group: 'order-check', item, swapped: true }));
const work = base.concat(swaps);
const worst = work.reduce(
  (sum, t) =>
    sum +
    ((Buffer.byteLength(
      JSON.stringify(payloadFor(t.item, questions, t.swapped)),
      'utf8',
    ) +
      2048) *
      0.042) /
      1e6,
  0,
);
console.log(
  JSON.stringify({
    run: args.includes('--run'),
    plannedCalls: work.length,
    known: known.owner.length,
    fresh: fresh.length,
    controls: controls.length,
    swaps: swaps.length,
    remainingUsd: 0.27 - ledger.committedUsd,
    conservativeCeilingUsd: worst,
  }),
);
if (!args.includes('--run')) process.exit(0);
if (worst > 0.27 - ledger.committedUsd)
  throw new Error(
    'Insufficient budget for conservative complete judge batch. No paid calls.',
  );
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
const output = new URL('jev.json', directory);
await writeFile(output, '{}', { flag: 'wx' });
await writeFile(
  new URL('fresh-pairs-private.json', directory),
  JSON.stringify(fresh, null, 2),
);
await writeFile(
  new URL('judge-blind-inputs.json', directory),
  JSON.stringify(
    work.map((task) => ({
      id: `${task.group}:${task.item.id}`,
      payload: payloadFor(task.item, questions, task.swapped),
    })),
    null,
    2,
  ),
  { flag: 'wx' },
);
const round = await openSharedEvaluationRound(
  directory,
  0.27,
  ledger.manifestHash,
);
const report = {
  implementationHashes: {
    runner: digest(await readFile(new URL(import.meta.url), 'utf8')),
    helper: digest(
      await readFile(new URL('./lib/acting-jev.mjs', import.meta.url), 'utf8'),
    ),
  },
  createdAt: new Date().toISOString(),
  manifestHash: ledger.manifestHash,
  calibrationApproved: false,
  runtimeChanged: false,
  knownReferenceHash: digest(known),
  judgeManifestHash: digest({ rubric, questions, controls, fresh }),
  questions,
  calls: [],
  stopped: null,
  summary: null,
};
const persist = () => round.persist(output, report);
try {
  for (const task of work) {
    const id = `${task.group}:${task.item.id}`;
    const payload = payloadFor(task.item, questions, task.swapped);
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
      raw: null,
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
      if (Buffer.byteLength(call.raw, 'utf8') > 32768)
        throw new Error('RESPONSE_TOO_LARGE');
      const parsed = JSON.parse(call.raw);
      if (Number.isFinite(parsed.usage?.cost) && parsed.usage.cost >= 0)
        call.usage = parsed.usage;
      call.answers = validateDecision(parsed, questions);
      call.consistencyAudit = decisionConflicts(call.answers);
      if (!call.usage || !Number.isInteger(call.usage.input_tokens))
        throw new Error('USAGE_MISSING');
      call.status = 'completed';
    } catch (error) {
      call.error =
        /^(HTTP_\d+|MODEL_MISMATCH|QUESTIONS_MISMATCH|INVALID_DECISION|USAGE_MISSING|RESPONSE_TOO_LARGE)$/u.test(
          error.message,
        )
          ? error.message
          : 'REQUEST_FAILED';
      call.status = 'failed';
      report.stopped = call.error;
    } finally {
      call.latencyMs = performance.now() - started;
      try {
        round.budget.settle(id, call.usage?.cost);
      } catch {
        report.stopped = 'PRICE_CEILING_VIOLATION';
      }
      await persist();
    }
    console.log(
      JSON.stringify({
        complete: report.calls.filter((c) => c.status === 'completed').length,
        planned: work.length,
        committedUsd: round.snapshot().roundCommittedUsd,
      }),
    );
    if (report.stopped) break;
  }
  report.summary = {
    contradictoryDecisions: report.calls
      .filter((c) => c.consistencyAudit?.requiresReview)
      .map((c) => ({ id: c.itemId, group: c.group, ...c.consistencyAudit })),
    knownPreference: preferenceAgreement(
      known.owner,
      report.calls
        .filter((c) => c.group === 'owner' && c.answers)
        .map((c) => ({
          id: c.itemId,
          preference: c.answers.preference.choice,
        })),
      [...known.pendingPreferenceIds, 'e429fbad8877'],
    ),
    knownCriteria: Object.fromEntries(
      ['acceptable', 'persona', 'expressivity'].map((name) => [
        name,
        criterionAgreement(known.owner, report.calls, name),
      ]),
    ),
    controls: controls.map((item) => ({
      id: item.id,
      expected: item.preference,
      actual:
        report.calls.find((c) => c.group === 'control' && c.itemId === item.id)
          ?.answers?.preference?.choice ?? null,
    })),
    orderChecks: report.calls
      .filter((c) => c.group === 'order-check' && c.answers)
      .map((c) => ({
        id: c.itemId,
        remapped: remapPreference(c.answers.preference.choice, true),
        original:
          report.calls.find(
            (o) => o.group === 'control' && o.itemId === c.itemId,
          )?.answers?.preference?.choice ?? null,
      })),
    freshPairsRequireHumanLabels: true,
  };
} finally {
  report.completedAt = new Date().toISOString();
  try {
    await persist();
  } finally {
    await round.close();
  }
}
console.log(
  JSON.stringify(
    { stopped: report.stopped, budget: report.budget, summary: report.summary },
    null,
    2,
  ),
);
