import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createEvaluationRouter } from '../src/evaluation/persona/router.ts';
import { createPinnedEvaluationFetch } from '../src/evaluation/persona/pinned-fetch.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import {
  fingerprint,
  textDiagnostics,
} from '../src/evaluation/persona/diagnostics.ts';
import { ShotBankSchema } from '../src/evaluation/persona/experimental-suite.ts';
import { buildRefinementMessages } from '../src/evaluation/persona/refinement-v3.ts';
import { contextualShotBank } from '../src/evaluation/persona/controlled-refinement.ts';
import {
  functionPassages,
  isolateDemonstrations,
} from '../src/evaluation/persona/isolated-examples.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import {
  buildVoicePersonaCore,
  voiceOutputFormat,
} from '../src/application/persona/voice-prompt.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../src/application/persona/presence-reference.ts';
import {
  readPersonaResponse,
  validateSpokenSegment,
} from '../src/application/persona/response-stream.ts';
import { streamSpeech } from '../src/application/voice/speech-stream.ts';
import { createParallelExpressionSpeech } from '../src/application/persona/parallel-expression.ts';
import {
  ExpressionSchema,
  describeExpressionContract,
} from '../src/domain/persona/expression.ts';

const args = process.argv.slice(2);
if (args.some((a) => !['--run', '--resume'].includes(a)))
  throw new Error('Use [--run] [--resume].');
const directory = new URL(
  '../data/refinement/latency-v8-remainder/',
  import.meta.url,
);
const reportPath = new URL('authors.json', directory);
const parent = JSON.parse(
  await readFile(
    new URL(
      '../data/refinement/acting-sequences-027-2026-10-08/quality-v2-1-budget.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const cap = 0.137070884;
if (
  parent.maxUsd !== 0.27 ||
  Math.abs(parent.committedUsd + cap - 0.27) > 1e-10
)
  throw new Error('PARENT_LEDGER_CHANGED');
const root = new URL('../../evals/persona/', import.meta.url);
const resources = {};
async function read(path) {
  const raw = await readFile(new URL(path, root), 'utf8');
  resources[path] = fingerprint(raw);
  return raw;
}
const suite = JSON.parse(await read('quality-v8/conversations.json'));
const bank = ShotBankSchema.parse(
  JSON.parse(await read('quality-v7/shots-sequences.json')),
);
const card = (await read('quality-v2.1/core-card.md')).trim();
const direction = (await read('quality-v2.1/turn-direction.md')).trim();
const presence = (await read('quality-v3/presence-positive.md')).trim();
const expressiveDirection = (
  await readFile(
    new URL(
      '../src/application/persona/expressive-direction-v1.md',
      import.meta.url,
    ),
    'utf8',
  )
).trim();
const originalCore = buildVoicePersonaCore(true, false);
const functions = functionPassages(bank);
const pool = functions.map((f) => bank.shots.find((s) => s.id === f.id));
const models = [
  {
    name: 'llama',
    id: 'meta-llama/llama-3.3-70b-instruct',
    family: 'meta',
    prompt: 0.1,
    completion: 0.32,
    providerOnly: 'deepinfra/turbo',
  },
  {
    name: 'deepseek',
    id: 'deepseek/deepseek-v4.1-flash',
    family: 'deepseek',
    prompt: 0.14,
    completion: 0.42,
    providerOnly: 'deepinfra/fp8',
    disableReasoning: true,
  },
];
const implementation = {};
for (const path of [
  'scripts/eval-latency-v8.mjs',
  'src/evaluation/persona/isolated-examples.ts',
  'src/evaluation/persona/refinement-v3.ts',
  'src/evaluation/persona/controlled-refinement.ts',
  'src/evaluation/persona/router.ts',
  'src/evaluation/persona/pinned-fetch.ts',
  'src/application/persona/parallel-expression.ts',
  'src/application/persona/observed-speech.ts',
  'src/application/persona/response-stream.ts',
  'src/application/voice/speech-stream.ts',
  'src/domain/persona/expression.ts',
])
  implementation[path] = fingerprint(
    await readFile(new URL('../' + path, import.meta.url), 'utf8'),
  );
const frozen = {
  resources,
  implementation,
  parent,
  models,
  originalCore,
  card,
  direction,
  presence,
  expressiveDirection,
  suite,
  functions,
  maxExamples: 3,
  temperature: 0.6,
  maxTokens: 512,
  observer: models[1],
  cap,
};
let hash = fingerprint(frozen);
let recoveryManifest;
if (args.includes('--resume')) {
  recoveryManifest = JSON.parse(
    await readFile(new URL('manifest.json', directory), 'utf8'),
  );
  const comparable = {
    ...frozen,
    implementation: {
      ...implementation,
      'scripts/eval-latency-v8.mjs':
        recoveryManifest.frozen.implementation['scripts/eval-latency-v8.mjs'],
    },
  };
  if (fingerprint(comparable) !== recoveryManifest.hash)
    throw new Error('RESUME_GENERATION_CONTRACT_CHANGED');
  // Preserve the author contract and ledger identity. Only orchestration was
  // repaired; record its revision separately, never replace the frozen manifest.
  hash = recoveryManifest.hash;
}
const groups = [];
for (let sample = 1; sample <= 2; sample++) {
  for (const [split, scenarios] of [
    ['development', suite.development],
    ['reserved', suite.reserved],
  ]) {
    if (sample > 1 && split === 'reserved') continue;
    for (const scenario of scenarios) groups.push({ sample, split, scenario });
  }
}
console.log(
  JSON.stringify({
    run: args.includes('--run'),
    manifestHash: hash,
    authorCalls: groups.reduce((n, g) => n + g.scenario.turns.length * 6, 0),
    observerCalls: groups.reduce((n, g) => n + g.scenario.turns.length * 2, 0),
    capUsd: cap,
    aggregatePriorUsd: parent.committedUsd,
    noAudio: true,
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
const endpoints = [];
for (const model of models) {
  const response = await fetch(
    'https://openrouter.ai/api/v1/models/' + model.id + '/endpoints',
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  const endpoint = (await response.json()).data.endpoints.find(
    (e) => e.tag === model.providerOnly,
  );
  if (
    !endpoint ||
    endpoint.status !== 0 ||
    Number(endpoint.pricing.prompt) * 1e6 > model.prompt + 1e-10 ||
    Number(endpoint.pricing.completion) * 1e6 > model.completion + 1e-10 ||
    Number(endpoint.pricing.request ?? 0) > 0 ||
    !['temperature', 'max_tokens', 'response_format'].every((p) =>
      endpoint.supported_parameters.includes(p),
    )
  )
    throw new Error('ROUTE_CONTRACT_CHANGED');
  endpoints.push({
    model: model.id,
    tag: endpoint.tag,
    pricing: endpoint.pricing,
  });
}
await mkdir(directory, { recursive: true });
let report;
try {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
if (
  report &&
  (!args.includes('--resume') ||
    report.manifestHash !== hash ||
    !report.stopped)
)
  throw new Error('EXISTING_FROZEN_ROUND');
if (!report && args.includes('--resume')) throw new Error('NO_ROUND_TO_RESUME');
report ??= {
  createdAt: new Date().toISOString(),
  manifestHash: hash,
  noAudio: true,
  productionChanged: false,
  calls: [],
  cases: [],
  stopped: null,
};
if (recoveryManifest) {
  await writeFile(
    new URL('resume-manifest.json', directory),
    JSON.stringify(
      {
        parent: hash,
        runnerHash: implementation['scripts/eval-latency-v8.mjs'],
        endpoints,
        reason: report.stopped,
      },
      null,
      2,
    ),
  );
  report.recoveries ??= [];
  report.recoveries.push({
    at: new Date().toISOString(),
    reason: report.stopped,
  });
  report.discardedAttempts ??= [];
  report.discardedAttempts.push(...report.cases.filter((c) => !c.complete));
  report.cases = report.cases.filter((c) => c.complete);
  report.stopped = null;
  delete report.completedAt;
} else {
  await writeFile(
    new URL('manifest.json', directory),
    JSON.stringify({ hash, frozen, endpoints }, null, 2),
  );
}
const round = await openSharedEvaluationRound(directory, cap, hash);
let writes = Promise.resolve();
const persist = () =>
  (writes = writes.then(() => round.persist(reportPath, report)));
const router = createEvaluationRouter({
  key: process.env.OPENROUTER_API_KEY,
  budget: round.budget,
  calls: report.calls,
  persist,
  fetcher: createPinnedEvaluationFetch({
    models,
    calls: report.calls,
    persist,
  }),
});
const embeddings = createLocalMemoryEmbeddings(
  process.env.MEMORY_MODEL_CACHE_DIRECTORY ??
    fileURLToPath(new URL('../data/models/', import.meta.url)),
);
const vectors = {};
async function select(arm, user, history) {
  const query =
    arm === 'baseline'
      ? JSON.stringify({ history: history.slice(-2), user })
      : JSON.stringify({
          user,
          previousUserTurns: history
            .slice(-2)
            .filter((m) => m.role === 'user')
            .map((m) => m.content),
        });
  const [vector] = await embeddings.embed([query], 'query');
  const source = arm === 'baseline' ? 'dialogue' : 'function';
  const scores = pool.map((shot, i) => ({
    id: shot.id,
    relevance: vector.reduce((s, v, k) => s + v * vectors[source][i][k], 0),
  }));
  return { bank: contextualShotBank(bank, scores, 3), scores, query };
}
try {
  await persist();
  vectors.dialogue = await embeddings.embed(
    pool.map(
      (s) =>
        s.situation +
        '\n' +
        s.messages
          .map((m) => m.content.replace(/<expression>.*?<\/expression>/su, ''))
          .join('\n'),
    ),
    'passage',
  );
  vectors.function = await embeddings.embed(
    functions.map((f) => f.description),
    'passage',
  );
  for (const [groupIndex, group] of groups.entries()) {
    const groupKey = `${group.scenario.id}:${group.sample}`;
    if (
      report.cases.filter((c) => c.groupKey === groupKey && c.complete)
        .length === 6
    )
      continue;
    const known = report.calls.filter(
      (c) => c.purpose.startsWith('author:') && c.usage?.cost != null,
    );
    const mean = known.length
      ? known.reduce((s, c) => s + c.usage.cost, 0) / known.length
      : 0.0004;
    if (
      round.snapshot().roundCommittedUsd +
        mean * group.scenario.turns.length * 6 +
        0.012 >
      cap - 0.02
    ) {
      report.stopped = 'AUTHOR_MARGIN_FOR_JEV';
      break;
    }
    const arms = ['baseline', 'isolated', 'parallel'];
    const rotation = (groupIndex + group.sample) % 3;
    const order = arms.slice(rotation).concat(arms.slice(0, rotation));
    const modelOrder = groupIndex % 2 ? [...models].reverse() : models;
    for (const arm of order) {
      for (const model of modelOrder) {
        const key = `${groupKey}:${model.name}:${arm}`;
        if (report.cases.some((c) => c.key === key && c.complete)) continue;
        const item = {
          key,
          groupKey,
          id: group.scenario.id,
          focus: group.scenario.focus,
          split: group.split,
          sample: group.sample,
          model: model.name,
          arm,
          turns: [],
          complete: false,
        };
        report.cases.push(item);
        const history = [];
        for (const [index, user] of group.scenario.turns.entries()) {
          const turn = {
            user,
            assistant: '',
            history: globalThis.structuredClone(history),
            raw: '',
            errors: [],
            expression: null,
            firstRawTextMs: null,
            firstSpeechTextMs: null,
            firstUsableTextMs: null,
          };
          item.turns.push(turn);
          const started = performance.now();
          const selected = await select(arm, user, history);
          turn.retrievalMs = performance.now() - started;
          turn.selectedIds = selected.bank.levels['1'];
          turn.retrievalScores = selected.scores;
          turn.retrievalQuery = selected.query;
          let messages = buildRefinementMessages({
            variant: 'acting',
            originalCore,
            card,
            direction,
            presence,
            system:
              originalCore +
              '\n' +
              PERSONA_PRESENCE_REFERENCE +
              voiceOutputFormat(0),
            history,
            content: user,
            bank: selected.bank,
            memoryBlock: '',
            canonicalMemory: true,
            expressiveDirection,
            plain: arm === 'parallel',
          });
          if (arm !== 'baseline')
            messages = isolateDemonstrations(messages, history.length);
          turn.messages = messages;
          const purpose = `author:${key}:${index}`;
          const signal = AbortSignal.timeout(45000);
          const source = async function* (streamSignal) {
            for await (const chunk of router.stream(
              model,
              messages,
              512,
              purpose,
              streamSignal,
            )) {
              turn.raw += chunk.content;
              if (chunk.content.trim())
                turn.firstRawTextMs ??= performance.now() - started;
              const end = turn.raw.indexOf('</expression>');
              if (
                (arm === 'parallel' && chunk.content.trim()) ||
                (end >= 0 && turn.raw.slice(end + 13).trim())
              )
                turn.firstSpeechTextMs ??= performance.now() - started;
              yield chunk.content;
            }
          };
          let pipeline;
          try {
            let speech;
            if (arm === 'parallel') {
              pipeline = createParallelExpressionSpeech({
                source,
                signal,
                factCount: 0,
                onExpression(value, event) {
                  turn.expression = {
                    ...value,
                    ...event,
                    readyMs: performance.now() - started,
                  };
                },
                async classify(firstSpeech, classifierSignal) {
                  turn.observer = {
                    firstSpeech,
                    startedMs: performance.now() - started,
                    raw: '',
                    error: null,
                  };
                  const observerMessages = [
                    {
                      role: 'system',
                      content:
                        'Classifique somente a atuação desta fala no contexto. JSON com intent, emotion e intensity. ' +
                        describeExpressionContract(),
                    },
                    {
                      role: 'user',
                      content: JSON.stringify({
                        history: history.slice(-4),
                        user,
                        speech: firstSpeech,
                      }),
                    },
                  ];
                  turn.observer.messages = observerMessages;
                  try {
                    for await (const chunk of router.stream(
                      models[1],
                      observerMessages,
                      160,
                      `observer:${key}:${index}`,
                      AbortSignal.any([
                        classifierSignal,
                        AbortSignal.timeout(12000),
                      ]),
                      { temperature: 0 },
                      true,
                    ))
                      turn.observer.raw += chunk.content;
                    return ExpressionSchema.parse(
                      JSON.parse(turn.observer.raw),
                    );
                  } catch (e) {
                    turn.observer.error = e.message;
                    throw e;
                  } finally {
                    turn.observer.completedMs = performance.now() - started;
                  }
                },
              });
              speech = pipeline.stream();
            } else {
              speech = streamSpeech(
                (s) =>
                  readPersonaResponse(source(s), (value, valid) => {
                    turn.expression = {
                      ...value,
                      valid,
                      readyMs: performance.now() - started,
                    };
                  }),
                signal,
              );
            }
            for await (const segment of speech) {
              const usable = validateSpokenSegment(segment);
              if (usable) {
                turn.firstUsableTextMs ??= performance.now() - started;
                turn.assistant += (turn.assistant ? ' ' : '') + usable;
              }
            }
            turn.authorCompletedMs = performance.now() - started;
          } catch (e) {
            turn.errors.push(e.message);
          }
          if (pipeline)
            turn.observationResult = await pipeline.observationResult();
          turn.elapsedIncludingObserverMs = performance.now() - started;
          turn.callIds = report.calls
            .filter((c) => c.purpose.endsWith(`${key}:${index}`))
            .map((c) => c.id);
          turn.diagnostics = textDiagnostics(
            turn.assistant,
            pool.flatMap((s) =>
              s.messages
                .filter((m) => m.role === 'assistant')
                .map((m) =>
                  m.content.replace(/<expression>.*?<\/expression>/su, ''),
                ),
            ),
            history.filter((m) => m.role === 'assistant').map((m) => m.content),
          );
          history.push(
            { role: 'user', content: user },
            { role: 'assistant', content: turn.assistant },
          );
          const failed = report.calls.find(
            (c) => turn.callIds.includes(c.id) && c.status === 'failed',
          );
          if (failed && /^EVALUATION_/u.test(failed.error ?? ''))
            report.stopped = failed.error;
          if (turn.errors.length) report.stopped = turn.errors[0];
          await persist();
          console.log(
            JSON.stringify({
              group: groupIndex + 1,
              groups: groups.length,
              model: model.name,
              arm,
              scenario: item.id,
              sample: item.sample,
              turn: index + 1,
              firstTextMs: turn.firstUsableTextMs,
              cost: round.snapshot().roundCommittedUsd,
              errors: turn.errors,
            }),
          );
          if (report.stopped) break;
        }
        item.complete =
          item.turns.length === group.scenario.turns.length &&
          item.turns.every((t) => t.assistant && !t.errors.length);
        await persist();
        if (report.stopped) break;
      }
      if (report.stopped) break;
    }
    if (report.stopped) break;
  }
} finally {
  report.completedAt = new Date().toISOString();
  try {
    await persist();
  } finally {
    await round.close();
    await embeddings.close();
  }
}
console.log(
  JSON.stringify({
    complete: report.cases.filter((c) => c.complete).length,
    calls: report.calls.length,
    stopped: report.stopped,
    budget: report.budget,
  }),
);
