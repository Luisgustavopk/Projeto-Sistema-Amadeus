import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createEvaluationRouter } from '../src/evaluation/persona/router.ts';
import { createPinnedEvaluationFetch } from '../src/evaluation/persona/pinned-fetch.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import {
  fingerprint,
  textDiagnostics,
} from '../src/evaluation/persona/diagnostics.ts';
import { buildRefinementMessages } from '../src/evaluation/persona/refinement-v3.ts';
import { memoryContent } from '../src/application/memory/context.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';
import { summarizeThreeModelV3 } from './lib/three-model-v3-report.mjs';

import { prepareEmotionalDepth } from '../src/evaluation/persona/emotional-depth.ts';
import { ShotBankSchema } from '../src/evaluation/persona/experimental-suite.ts';
import { buildVoicePersonaCore } from '../src/application/persona/voice-prompt.ts';

const args = process.argv.slice(2);
if (
  args.some(
    (arg) =>
      arg !== '--run' && arg !== '--resume' && !arg.startsWith('--budget='),
  )
)
  throw new Error('Use --budget=0.15 e, para executar, --run.');
const run = args.includes('--run');
const resume = args.includes('--resume');
const maxUsd = Number(
  args.find((arg) => arg.startsWith('--budget='))?.slice(9),
);
if (maxUsd !== 0.15)
  throw new Error('Esta rodada exige teto explícito --budget=0.15.');
const directory = new URL(
  '../data/refinement/emotional-depth-after-015-2026-10-08/',
  import.meta.url,
);
const root = new URL('../../evals/persona/quality-v5/', import.meta.url);
const oldRoot = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const resources = {};
async function readResource(name, base = root) {
  const raw = await readFile(new URL(name, base), 'utf8');
  resources[new URL(name, base).pathname] = fingerprint(raw);
  return raw;
}
const suite = JSON.parse(await readResource('emotional-depth-pt-BR.json'));
for (const path of Object.values(suite.references))
  await readResource(path, new URL('../../../../', import.meta.url));
const card = (await readResource('core-card.md', oldRoot)).trim();
const direction = (await readResource('turn-direction.md', oldRoot)).trim();
const presence = (
  await readResource(
    'presence-positive.md',
    new URL('../../evals/persona/quality-v3/', import.meta.url),
  )
).trim();
const expressiveDirection = (
  await readResource(
    'code/backend/api/src/application/persona/expressive-direction-v1.md',
    new URL('../../../../', import.meta.url),
  )
).trim();
const previousSuite = JSON.parse(
  await readResource(
    'emotional-pt-BR.json',
    new URL('../../evals/persona/quality-v4/', import.meta.url),
  ),
);
const bank = ShotBankSchema.parse(
  JSON.parse(await readResource('shots.json', oldRoot)),
);
const prepared = prepareEmotionalDepth(suite, previousSuite, [
  card,
  direction,
  presence,
  expressiveDirection,
  ...bank.shots.flatMap((shot) =>
    shot.messages.map((message) => message.content),
  ),
]);
const originalCore = buildVoicePersonaCore(true, false);
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
  {
    name: 'qwen',
    id: 'qwen/qwen-2.5-72b-instruct',
    family: 'qwen',
    prompt: 0.36,
    completion: 0.4,
    providerOnly: 'deepinfra/fp8',
  },
];
// Frozen order spreads emotional families across a budget-limited sample.
const order = [
  25, 35, 30, 40, 44, 29, 37, 41, 47, 38, 26, 32, 39, 36, 28, 42, 48, 27, 31,
  34, 43, 45, 33, 46,
]
  .map((number) => `PBR${number}`)
  .concat(
    prepared.authorCases
      .filter((item) => Number(item.id.slice(3)) < 25)
      .map((item) => item.id),
  );
if (new Set(order).size !== prepared.authorCases.length)
  throw new Error('Ordem incompleta.');
const jobs = order.flatMap((id, index) => {
  const scenario = prepared.authorCases.find((item) => item.id === id);
  const offset = index % models.length;
  return [...models.slice(offset), ...models.slice(0, offset)].map((model) => ({
    phase: 'emotional',
    scenario,
    model,
    sample: 1,
    variant: 'after',
  }));
});
const implementation = {};
for (const path of [
  'scripts/eval-emotional-depth.mjs',
  'scripts/lib/three-model-v3-report.mjs',
  'src/evaluation/persona/emotional-suite.ts',
  'src/evaluation/persona/emotional-depth.ts',
  'src/application/persona/expressive-direction-v1.md',
  'src/application/persona/presence-direction.ts',
  'src/application/persona/presence-turn-v2.md',
  'src/evaluation/persona/refinement-v3.ts',
  'src/evaluation/persona/router.ts',
  'src/evaluation/persona/pinned-fetch.ts',
  'src/evaluation/persona/shared-round.ts',
  'src/evaluation/persona/budget.ts',
  'src/evaluation/persona/experimental-suite.ts',
  'src/application/persona/conversation-style.ts',
  'src/application/persona/voice-prompt.ts',
  'src/application/persona/presence-reference.ts',
  'src/application/persona/skill-reference.ts',
  'src/application/persona/canon-reference.ts',
  'src/application/persona/voice-runtime-v1.md',
  'src/application/persona/skill-amadeus-kurisu.md',
  'src/application/persona/conversation-presence-v1.md',
  'src/application/memory/context.ts',
  'src/application/memory/memory-use-v1.md',
  'src/application/memory/memory-response-v1.md',
  'src/application/memory/memory-answer-direction-v1.md',
  'src/domain/memory/response-use.ts',
  'src/domain/persona/expression.ts',
  'src/application/voice/turn-processor.ts',
  'src/application/voice/context.ts',
  'src/application/voice/history-context.ts',
  'src/application/persona/speech-recovery.ts',
  'src/application/persona/response-stream.ts',
  'src/application/voice/speech-stream.ts',
])
  implementation[path] = fingerprint(
    await readFile(new URL('../' + path, import.meta.url), 'utf8'),
  );
const frozen = {
  version: 'emotional-depth-after-1',
  originalCore,
  card,
  direction,
  presence,
  expressiveDirection,
  bank,
  models,
  jobs,
  resources,
  implementation,
  prepared,
  temperature: 0.6,
  maxTokens: 512,
  maxUsd,
  canonicalMemory: true,
  outputFormat: 'expression-header',
  synthetic: true,
  noAudio: true,
  samplesPerScenario: 1,
  paidJudge: false,
  humanReferenceConfirmed: false,
  memoryVerifier: 'stub-no-semantic-verification',
  scope:
    'Roteiro aprofundado aprovado; PBR47 com as duas remoções. Somente after nos três autores, uma amostra, sequências próprias. Prioridade ao novo roteiro PBR25–48; regressão PBR01–24 em seguida se houver saldo. Teto novo US$ 0,15, cobertura pode ser parcial. Sem voz, juiz pago ou alteração da produção.',
};
const plan = {
  frozen,
  fingerprint: fingerprint(frozen),
  plannedTurns: jobs.reduce((sum, job) => sum + job.scenario.turns.length, 0),
  estimateUsdNoCache: jobs.reduce(
    (sum, job) =>
      sum +
      (job.scenario.turns.length *
        (3800 * job.model.prompt + 140 * job.model.completion)) /
        1e6,
    0,
  ),
};
console.log(
  JSON.stringify({
    prepared: true,
    run,
    plannedTurns: plan.plannedTurns,
    maxUsd,
    estimateUsdNoCache: plan.estimateUsdNoCache,
    manifestHash: plan.fingerprint,
  }),
);
if (!run) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
// Full coverage is a plan, not a spend authorization beyond the hard budget.
console.log(
  JSON.stringify({ coverageMayBePartial: plan.estimateUsdNoCache > maxUsd }),
);
await mkdir(directory, { recursive: true });
const planPath = new URL('plan.json', directory);
try {
  const saved = JSON.parse(await readFile(planPath, 'utf8'));
  if (saved.fingerprint !== plan.fingerprint)
    throw new Error(
      'Rodada congelada divergente; não altere o manifesto antigo.',
    );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const reportPath = new URL('emotional-depth-after.json', directory);
let previousReport;
try {
  previousReport = JSON.parse(await readFile(reportPath, 'utf8'));
  if (!resume || previousReport.stopped !== 'EVALUATION_HTTP_429')
    throw new Error('Rodada já executada; retomada só após HTTP 429.');
  const failed = previousReport.calls.findLast(
    (call) => call.httpStatus === 429,
  );
  if (
    Date.now() <
    Date.parse(previousReport.completedAt) + (failed?.retryAfterMs ?? 60000)
  )
    throw new Error('EVALUATION_ROUTE_COOLDOWN');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (resume && !previousReport) throw new Error('Não há rodada para retomar.');
plan.endpoints = [];
for (const model of models) {
  const response = await fetch(
    'https://openrouter.ai/api/v1/models/' + model.id + '/endpoints',
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error('Catálogo indisponível.');
  const endpoint = (await response.json()).data.endpoints.find(
    (item) => item.tag === model.providerOnly,
  );
  if (
    !endpoint ||
    endpoint.status !== 0 ||
    Number(endpoint.pricing.prompt) * 1e6 > model.prompt + 1e-12 ||
    Number(endpoint.pricing.completion) * 1e6 > model.completion + 1e-12 ||
    Number(endpoint.pricing.request ?? 0) > 0
  )
    throw new Error('Rota fora do contrato: ' + model.name);
  for (const parameter of [
    'temperature',
    'max_tokens',
    ...(model.disableReasoning ? ['reasoning'] : []),
  ])
    if (!endpoint.supported_parameters.includes(parameter))
      throw new Error('Parâmetro não suportado: ' + parameter);
  plan.endpoints.push({
    model: model.id,
    tag: endpoint.tag,
    status: endpoint.status,
    pricing: endpoint.pricing,
    provider: endpoint.provider_name,
  });
}
await writeFile(planPath, JSON.stringify(plan, null, 2));
let previous = { committedUsd: 0 };
try {
  previous = JSON.parse(
    await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const shared = await openSharedEvaluationRound(
  directory,
  maxUsd,
  plan.fingerprint,
);
const report = previousReport ?? {
  suite: 'emotional-depth-after-015',
  createdAt: new Date().toISOString(),
  plan,
  synthetic: true,
  noAudio: true,
  paidJudge: false,
  humanReferenceConfirmed: false,
  priorCommittedUsd: previous.committedUsd,
  calls: [],
  cases: [],
  stopped: null,
  budget: null,
};
const complete = (item) =>
  item.turns.length ===
    prepared.authorCases.find((s) => s.id === item.id)?.turns.length &&
  item.turns.every((t) => t.assistant && !t.errors.length);
if (previousReport) {
  await writeFile(
    new URL(`interruption-${Date.now()}.json`, directory),
    JSON.stringify(previousReport, null, 2),
  );
  report.interruptedCases ??= [];
  report.interruptedCases.push(
    ...report.cases.filter((item) => !complete(item)),
  );
  report.cases = report.cases.filter(complete);
  report.executionEpochs ??= [];
  report.executionEpochs.push({
    resumedAt: new Date().toISOString(),
    priorCommittedUsd: previous.committedUsd,
  });
  report.stopped = null;
  delete report.completedAt;
}
let pendingPersist = Promise.resolve();
const persist = () => {
  pendingPersist = pendingPersist.then(() =>
    shared.persist(reportPath, report),
  );
  return pendingPersist;
};
const router = createEvaluationRouter({
  key: process.env.OPENROUTER_API_KEY,
  budget: shared.budget,
  calls: report.calls,
  persist,
  fetcher: createPinnedEvaluationFetch({
    models,
    calls: report.calls,
    persist,
  }),
});
const stopFor = (error) => {
  if (
    /^EVALUATION_(BUDGET_EXHAUSTED|PRICE_CEILING_VIOLATION|HTTP_40[123]|HTTP_429|ROUTE_COOLDOWN)$/u.test(
      error.message ?? '',
    )
  )
    report.stopped = error.message;
};
const errorDetails = (error) => ({
  name: error?.name ?? 'UnknownError',
  code: error?.code ?? null,
  message: String(error?.message ?? 'Erro desconhecido').slice(0, 300),
});
const persona = {
  version: PERSONA_VERSION,
  revision: 0,
  direction: '',
  updatedAt: null,
};
try {
  await persist();
  for (const [jobIndex, job] of jobs.entries()) {
    if (report.stopped) break;
    const { scenario, model, sample, variant, phase } = job;
    if (
      report.cases.some(
        (item) =>
          item.id === scenario.id &&
          item.model === model.name &&
          complete(item),
      )
    )
      continue;
    // Begin a new triple only if expected group cost plus one maximal request fits.
    if (jobIndex % 3 === 0) {
      const expected = models.reduce((sum, m) => {
        const previous = report.calls.filter(
          (c) => c.model === m.id && c.usage?.cost != null,
        );
        const mean = previous.length
          ? previous.reduce((a, c) => a + c.usage.cost, 0) / previous.length
          : (4700 * m.prompt + 140 * m.completion) / 1e6;
        return sum + mean * scenario.turns.length;
      }, 0);
      if (expected + 0.009 > maxUsd - shared.snapshot().roundCommittedUsd) {
        report.stopped = 'BUDGET_GROUP_MARGIN';
        break;
      }
    }
    const actualVariant = scenario.facts.length ? 'grounded' : 'acting';
    const examples = bank.shots
      .filter(
        (shot) =>
          bank.levels['1'].includes(shot.id) &&
          (actualVariant === 'baseline' || shot.kind === 'style-adaptation'),
      )
      .flatMap((shot) =>
        shot.messages
          .filter((m) => m.role === 'assistant')
          .map((m) => m.content.replace(/<expression>.*?<\/expression>/su, '')),
      );
    const recent = JSON.parse(JSON.stringify(scenario.history ?? []));
    const facts = (scenario.facts ?? []).map((text, index) => ({
      id: 'fixture-' + index,
      version: 1,
      text,
      dataClass: 'synthetic',
      kind: 'fact',
      expiresAt: null,
    }));
    const memoryBlock = facts.length
      ? memoryContent('', JSON.stringify({ facts }))
      : '';
    const item = {
      id: scenario.id,
      split: scenario.split,
      domain: scenario.domain,
      expectation: scenario.expectation,
      phase,
      variant,
      model: model.name,
      sample,
      turns: [],
    };
    report.cases.push(item);
    let active;
    const providers = {
      execute: async () => {
        throw new Error('Este ensaio proíbe STT/TTS.');
      },
      executeStream: async function* (input, signal) {
        const messages = buildRefinementMessages({
          variant: actualVariant,
          originalCore,
          card,
          direction,
          presence,
          system: input.systemPrompt,
          history: input.history ?? [],
          content: input.content,
          bank,
          memoryBlock,
          canonicalMemory: true,
          expressiveDirection,
        });
        const attempt = {
          messages,
          maxTokens: input.maxTokens,
          facts,
          hash: fingerprint(messages),
          raw: '',
          error: null,
        };
        active.inputs.push(attempt);
        try {
          for await (const chunk of router.stream(
            model,
            messages,
            input.maxTokens,
            'conversation',
            signal,
          )) {
            attempt.raw += chunk.content;
            active.rawReply += chunk.content;
            if (chunk.content.trim())
              active.firstRawTextMs ??= performance.now() - active.started;
            const end = attempt.raw.indexOf('</expression>');
            if (
              (variant === 'plain' && chunk.content.trim()) ||
              (end >= 0 && attempt.raw.slice(end + 13).trim())
            )
              active.firstSpeechTextMs ??= performance.now() - active.started;
            yield chunk;
          }
        } catch (error) {
          attempt.error = errorDetails(error);
          stopFor(error);
          throw error;
        }
      },
    };
    const history = {
      startSession: async () => {},
      endSession: async () => {},
      beginTurn: async () => {},
      updateTurn: async () => {},
      recent: async () => recent,
      addSegment: async () => {},
      setAudio: async () => {},
      acknowledge: async () => false,
    };
    const metrics = createVoiceMetrics();
    const processor = createTurnProcessor(
      providers,
      history,
      {
        ...metrics,
        time(stage, ms) {
          metrics.time(stage, ms);
          if (active) (active.stageDurations[stage] ??= []).push(ms);
        },
      },
      { get: async () => persona },
      {
        retrieve: async () => (facts.length ? JSON.stringify({ facts }) : ''),
        interruptBackground: () => {},
        validateContext: async () => true,
        reviewMode: async () => 'selective',
        verifyAnswer: async () => null,
      },
    );
    const conversationId = randomUUID();
    for (const [index, turn] of scenario.turns.entries()) {
      if (report.stopped) break;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 2000));
      active = {
        user: typeof turn === 'string' ? turn : '',
        initiativeKind:
          typeof turn === 'string' ? undefined : turn.initiativeKind,
        assistant: '',
        rawReply: '',
        facts,
        history: JSON.parse(JSON.stringify(recent)),
        inputs: [],
        stageDurations: {},
        errors: [],
        started: performance.now(),
      };
      item.turns.push(active);
      const firstCall = report.calls.length;
      const signal = AbortSignal.timeout(60000);
      try {
        await processor.process(
          {
            sessionId: conversationId,
            conversationId,
            ownerId: 'synthetic-refinement-v3',
            turnId: index + 1,
            responseId: randomUUID(),
            dataClass: 'synthetic',
            text: active.user,
            initiativeKind: active.initiativeKind,
            profile: null,
            signal,
            speechEndedAt: active.started,
          },
          {
            send(event) {
              if (event.type === 'reply.text') {
                active.firstUsableTextMs ??= performance.now() - active.started;
                active.assistant += (active.assistant ? ' ' : '') + event.text;
              }
              if (event.type === 'reply.expression') active.expression = event;
              if (event.type === 'error' && event.code !== 'VOICE_NOT_READY')
                active.errors.push(event.code);
            },
          },
        );
      } catch (error) {
        active.errors.push('EVALUATION_TURN_FAILED');
        active.failure = errorDetails(error);
        stopFor(error);
      }
      active.totalMs = performance.now() - active.started;
      active.callIds = report.calls.slice(firstCall).map((call) => call.id);
      active.diagnostics = textDiagnostics(
        active.assistant,
        examples,
        recent.map((entry) => entry.sentText ?? ''),
      );
      recent.push({
        userText: active.user,
        initiativeKind: active.initiativeKind,
        generatedText: '',
        sentText: active.assistant,
        dataClass: 'synthetic',
        responseStatus: active.errors.length ? 'failed' : 'completed',
        partiallyPlayed: false,
      });
      await persist();
      console.log(
        JSON.stringify({
          job: jobIndex + 1,
          phase,
          scenario: item.id,
          model: model.name,
          variant,
          sample,
          turn: index + 1,
          errors: active.errors,
          firstTextMs: active.firstUsableTextMs,
          committedUsd: shared.snapshot().roundCommittedUsd,
        }),
      );
      if (active.errors.length) break;
    }
  }
} finally {
  report.completedAt = new Date().toISOString();
  try {
    await persist();
  } finally {
    await shared.close();
  }
}
const summary = await summarizeThreeModelV3(reportPath, report);
console.log(JSON.stringify({ report: reportPath.pathname, ...summary }));
