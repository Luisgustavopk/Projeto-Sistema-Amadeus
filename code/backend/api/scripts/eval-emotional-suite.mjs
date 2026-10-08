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

import { prepareEmotionalSuite } from '../src/evaluation/persona/emotional-suite.ts';
import { ShotBankSchema } from '../src/evaluation/persona/experimental-suite.ts';
import { buildVoicePersonaCore } from '../src/application/persona/voice-prompt.ts';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--run' && !arg.startsWith('--budget=')))
  throw new Error('Use --budget=0.25 e, para executar, --run.');
const run = args.includes('--run');
const maxUsd = Number(
  args.find((arg) => arg.startsWith('--budget='))?.slice(9),
);
if (maxUsd !== 0.25)
  throw new Error('Esta rodada exige teto explícito --budget=0.25.');
const directory = new URL(
  '../data/refinement/emotional-025-2026-10-08/',
  import.meta.url,
);
const root = new URL('../../evals/persona/quality-v3/', import.meta.url);
const oldRoot = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const resources = {};
async function readResource(name, base = root) {
  const raw = await readFile(new URL(name, base), 'utf8');
  resources[new URL(name, base).pathname] = fingerprint(raw);
  return raw;
}
const suite = JSON.parse(await readResource('personality-pt-BR.json'));
for (const path of Object.values(suite.references))
  await readResource(path, new URL('../../../../', import.meta.url));
const card = (await readResource('core-card.md', oldRoot)).trim();
const direction = (await readResource('turn-direction.md', oldRoot)).trim();
const presence = (await readResource('presence-positive.md')).trim();
const bank = ShotBankSchema.parse(
  JSON.parse(await readResource('shots.json', oldRoot)),
);
const prepared = prepareEmotionalSuite(suite, [
  card,
  direction,
  presence,
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
const order = suite.executionGroups.flatMap((group) => group.cases);
if (
  new Set(order).size !== prepared.authorCases.length ||
  order.some(
    (id) => !prepared.authorCases.some((scenario) => scenario.id === id),
  )
)
  throw new Error('Grupos de execução inválidos.');
const jobs = order.flatMap((id, index) => {
  const scenario = prepared.authorCases.find((item) => item.id === id);
  const offset = index % models.length;
  return [...models.slice(offset), ...models.slice(0, offset)].map((model) => ({
    phase: 'emotional',
    scenario,
    model,
    sample: 1,
    variant: scenario.facts.length ? 'grounded' : 'acting',
  }));
});
const implementation = {};
for (const path of [
  'scripts/eval-emotional-suite.mjs',
  'scripts/lib/three-model-v3-report.mjs',
  'src/evaluation/persona/emotional-suite.ts',
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
  version: 'emotional-round-1',
  originalCore,
  card,
  direction,
  presence,
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
    'Roteiro emocional em pt-BR, desenvolvimento já visto; uma amostra por conversa. Mesmo candidato de atuação nos três autores; sem mudança de produção, áudio ou promoção automática. Revisão do agente é diagnóstico, não calibração humana.',
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
if (plan.estimateUsdNoCache > maxUsd)
  throw new Error('Estimativa acima do orçamento autorizado.');
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
const reportPath = new URL('emotional-three-models.json', directory);
try {
  await readFile(reportPath);
  throw new Error('Rodada já executada. Reexecutar não renova orçamento.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
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
const report = {
  suite: 'emotional-three-models-025',
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
    /^EVALUATION_(BUDGET_EXHAUSTED|PRICE_CEILING_VIOLATION|HTTP_40[123])$/u.test(
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
    const actualVariant = phase === 'latency' ? 'acting' : variant;
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
