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
import { summarizeJevV8 } from './lib/jev-v8-summary.mjs';
const args = process.argv.slice(2);
if (args.some((a) => a !== '--run')) throw new Error('Use [--run].');
const directory = new URL(
  '../data/refinement/latency-v8-remainder/',
  import.meta.url,
);
const root = new URL('../../evals/persona/quality-v8/', import.meta.url);
const authors = JSON.parse(
  await readFile(new URL('authors.json', directory), 'utf8'),
);
const ledger = JSON.parse(
  await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
);
if (
  !authors.completedAt ||
  authors.manifestHash !== ledger.manifestHash ||
  ledger.maxUsd !== 0.137070884
)
  throw new Error('AUTHORS_OR_LEDGER_INCOMPLETE');
const reference = JSON.parse(
  await readFile(
    new URL(
      '../data/refinement/jev-calibration-owner-2026-10-08/calibration-reference.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const rubric = await readFile(new URL('jev-rubric.md', root), 'utf8');
const questions = questionsFor(rubric);
questions.acceptable_A.criteria = questions.acceptable_B.criteria = {
  sim: 'Participação natural, proporcional, sustentada e contínua no momento concreto. Não substitui a interação por atendimento, eco ou lição genérica.',
  nao: 'Atendimento ou lição genérica em lugar da interação; fato inventado, pedido ignorado, contexto perdido ou reação deslocada. Correção factual isolada não basta.',
  incerto:
    'Evidência insuficiente para decidir adequação; não converter ausência de erro em aprovação.',
};
questions.persona_A.criteria = questions.persona_B.criteria = {
  sim: 'Postura contextual distinguível: firmeza com razões, orgulho reservado, curiosidade concreta, humor recíproco ou calor sóbrio, coerente com Amadeus.',
  nao: 'Fala intercambiável de assistente, servilismo, bajulação, lição genérica ou vivência inventada. Tema científico e cortesia isolados não demonstram a personagem.',
  incerto:
    'A função do turno não permite inferir traço, ou evidência realmente ambígua; incerto não equivale a aprovação.',
};
questions.expressivity_A.criteria = questions.expressivity_B.criteria = {
  sim: 'Reação textual perceptível ao alvo e à mudança atual, proporcional e coerente com o histórico. Não exige interjeição.',
  nao: 'Fórmula genérica onde cabe reação específica; emoção deslocada, riso sem reciprocidade, hesitação enfeitada ou intensidade incompatível com reparo/insistência.',
  incerto:
    'Não cabe inferir reação pelo texto, ou o turno simples não pede expressão marcada. Reticências não provam emoção.',
};
const controls = JSON.parse(
  await readFile(new URL('jev-controls.json', root), 'utf8'),
).controls.map((c) => ({
  ...c,
  options: {
    A: { context: c.context, reply: c.A },
    B: { context: c.context, reply: c.B },
  },
}));
const fresh = [];
for (const a of authors.cases.filter(
  (c) =>
    c.arm === 'parallel' && c.model === 'llama' && c.sample === 1 && c.complete,
)) {
  const b = authors.cases.find(
    (c) =>
      c.groupKey === a.groupKey &&
      c.model === 'deepseek' &&
      c.arm === 'parallel' &&
      c.complete,
  );
  if (!b) continue;
  for (const [index, t] of a.turns.entries()) {
    const reversed =
      Number.parseInt(digest([a.key, index]).slice(0, 2), 16) % 2 === 1;
    const options = [a, b].map((c) => ({
      context: c.turns[index].history
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n'),
      reply: c.turns[index].assistant,
    }));
    fresh.push({
      id: digest([a.key, index, options]).slice(0, 12),
      current: t.user,
      sharedFacts: '',
      options: reversed
        ? { A: options[1], B: options[0] }
        : { A: options[0], B: options[1] },
      privateMapping: reversed
        ? { A: 'deepseek', B: 'llama' }
        : { A: 'llama', B: 'deepseek' },
      scenario: a.id,
      turn: index + 1,
    });
  }
}
const tasks = [
  ...reference.owner.map((item) => ({ group: 'owner', item, swapped: false })),
  ...reference.synthetic.map((item) => ({
    group: 'extra',
    item,
    swapped: false,
  })),
  ...controls.map((item) => ({ group: 'control', item, swapped: false })),
  ...controls
    .slice(0, 6)
    .map((item) => ({ group: 'order-check', item, swapped: true })),
  ...fresh.map((item) => ({ group: 'fresh', item, swapped: false })),
];
const worst = tasks.reduce(
  (s, t) =>
    s +
    ((Buffer.byteLength(
      JSON.stringify(payloadFor(t.item, questions, t.swapped)),
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
    fresh: fresh.length,
    remainingUsd: ledger.maxUsd - ledger.committedUsd,
    conservativeCeilingUsd: worst,
    stopWhenNextReservationDoesNotFit: true,
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
const path = new URL('jev.json', directory);
await writeFile(path, '{}', { flag: 'wx' });
const frozen = {
  rubric,
  questions,
  controls,
  referenceHash: digest(reference),
  fresh,
  runnerHash: digest(await readFile(new URL(import.meta.url), 'utf8')),
};
await writeFile(
  new URL('judge-manifest.json', directory),
  JSON.stringify({ hash: digest(frozen), frozen }, null, 2),
);
await writeFile(
  new URL('judge-blind-inputs.json', directory),
  JSON.stringify(
    tasks.map((t) => ({
      group: t.group,
      id: t.item.id,
      swapped: t.swapped,
      payload: payloadFor(t.item, questions, t.swapped),
    })),
    null,
    2,
  ),
);
const round = await openSharedEvaluationRound(
  directory,
  ledger.maxUsd,
  ledger.manifestHash,
);
const report = {
  manifestHash: ledger.manifestHash,
  createdAt: new Date().toISOString(),
  calibrationApproved: false,
  runtimeChanged: false,
  calls: [],
  stopped: null,
};
const persist = () => round.persist(path, report);
try {
  for (const task of tasks) {
    const payload = payloadFor(task.item, questions, task.swapped);
    const id = `${task.group}:${task.item.id}`;
    let reservedUsd;
    try {
      // Each request has a durable conservative reservation. Reconcile its
      // reported charge before considering the next one; never renew the cap.
      reservedUsd = round.budget.reserve(id, payload, 1, {
        prompt: 0.042,
        completion: 0,
      });
    } catch (error) {
      if (error.message !== 'EVALUATION_BUDGET_EXHAUSTED') throw error;
      report.stopped = error.message;
      break;
    }
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
    const start = performance.now();
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
      call.consistencyAudit = decisionConflicts(call.answers);
      if (!call.usage) throw new Error('USAGE_MISSING');
      call.status = 'completed';
    } catch (e) {
      call.error = e.message;
      call.status = 'failed';
      report.stopped = e.message;
    } finally {
      call.latencyMs = performance.now() - start;
      round.budget.settle(id, call.usage?.cost);
      await persist();
    }
    console.log(
      JSON.stringify({
        complete: report.calls.length,
        total: tasks.length,
        cost: round.snapshot().roundCommittedUsd,
      }),
    );
    if (report.stopped) break;
  }
  report.summary = summarizeJevV8(reference, controls, report);
} finally {
  report.completedAt = new Date().toISOString();
  try {
    await persist();
  } finally {
    await round.close();
  }
}
console.log(
  JSON.stringify({
    stopped: report.stopped,
    budget: report.budget,
    summary: report.summary,
  }),
);
