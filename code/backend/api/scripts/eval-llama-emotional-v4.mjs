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
import { prepareEmotionalSuite } from '../src/evaluation/persona/emotional-suite.ts';
import { planEmotionalV4 } from '../src/evaluation/persona/emotional-v4-plan.ts';
import { ShotBankSchema } from '../src/evaluation/persona/experimental-suite.ts';
import { buildVoicePersonaCore } from '../src/application/persona/voice-prompt.ts';
import { summarizeLlamaEmotionalV4 } from './lib/llama-emotional-v4-report.mjs';

const args = process.argv.slice(2);
if (
  !args.includes('--remaining-budget') ||
  args.some((arg) => !['--remaining-budget', '--run', '--resume'].includes(arg))
)
  throw new Error(
    'Use --remaining-budget e, para executar, --run; sem renovar orçamento.',
  );
const run = args.includes('--run');
const resume = args.includes('--resume');
const parentDirectory = new URL(
  '../data/refinement/emotional-025-2026-10-08/',
  import.meta.url,
);
const parentRaw = await readFile(
  new URL('quality-v2-1-budget.json', parentDirectory),
  'utf8',
);
const parent = JSON.parse(parentRaw);
const parentPlan = JSON.parse(
  await readFile(new URL('plan.json', parentDirectory), 'utf8'),
);
if (
  parent.round !== 'quality-v2.1' ||
  parent.maxUsd !== 0.25 ||
  parent.manifestHash !== parentPlan.fingerprint ||
  !Number.isFinite(parent.committedUsd) ||
  parent.committedUsd < 0 ||
  parent.committedUsd >= parent.maxUsd
)
  throw new Error('Orçamento herdado inválido ou esgotado.');
const maxUsd = parent.maxUsd - parent.committedUsd;
const directory = new URL(
  '../data/refinement/llama-emotional-v4-carried-2026-10-08/',
  import.meta.url,
);
const root = new URL('../../evals/persona/quality-v4/', import.meta.url);
const oldRoot = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const repository = new URL('../../../../', import.meta.url);
const resources = {};
async function readResource(name, base = root) {
  const raw = await readFile(new URL(name, base), 'utf8');
  resources[new URL(name, base).pathname] = fingerprint(raw);
  return raw;
}
const suite = JSON.parse(await readResource('emotional-pt-BR.json'));
for (const path of Object.values(suite.references))
  await readResource(path, repository);
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
    repository,
  )
).trim();
const bank = ShotBankSchema.parse(
  JSON.parse(await readResource('shots.json', oldRoot)),
);
const prepared = prepareEmotionalSuite(suite, [
  card,
  direction,
  presence,
  expressiveDirection,
  ...bank.shots.flatMap((shot) =>
    shot.messages.map((message) => message.content),
  ),
]);
const design = planEmotionalV4(prepared);
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
];
const jobs = design.jobs.map((job) => ({ ...job, model: models[0] }));
const implementation = {};
for (const path of [
  'scripts/eval-llama-emotional-v4.mjs',
  'scripts/lib/llama-emotional-v4-report.mjs',
  'src/evaluation/persona/emotional-v4-plan.ts',
  'src/evaluation/persona/emotional-suite.ts',
  'src/evaluation/persona/refinement-v3.ts',
  'src/evaluation/persona/router.ts',
  'src/evaluation/persona/pinned-fetch.ts',
  'src/evaluation/persona/shared-round.ts',
  'src/evaluation/persona/budget.ts',
  'src/evaluation/persona/experimental-suite.ts',
  'src/application/persona/conversation-style.ts',
  'src/application/persona/voice-prompt.ts',
  'src/application/persona/expressive-reference.ts',
  'src/application/persona/expressive-direction-v1.md',
  'src/application/persona/presence-reference.ts',
  'src/application/persona/conversation-presence-v2.md',
  'src/application/persona/presence-direction.ts',
  'src/application/persona/presence-turn-v2.md',
  'src/application/persona/skill-reference.ts',
  'src/application/persona/canon-reference.ts',
  'src/application/persona/voice-runtime-v1.md',
  'src/application/persona/skill-amadeus-kurisu.md',
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
  version: 'llama-emotional-v4-1',
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
  design,
  temperature: 0.6,
  maxTokens: 512,
  canonicalMemory: true,
  outputFormat: 'expression-header',
  synthetic: true,
  noAudio: true,
  paidJudge: false,
  humanReferenceConfirmed: false,
  maxUsd,
  parentBudget: {
    maxUsd: parent.maxUsd,
    priorCommittedUsd: parent.committedUsd,
    manifestHash: parent.manifestHash,
    ledgerHash: fingerprint(parentRaw),
  },
  memoryVerifier: 'stub-no-semantic-verification',
  scope:
    'Llama principal; dez conversas comparadas em dois braços e três amostras, demais catorze como cobertura do candidato. Desenvolvimento aprovado, não reservado. Só expressiveDirection varia; âncora corrigida comum. Sem áudio ou juiz pago.',
};
let plan = {
  frozen,
  fingerprint: fingerprint(frozen),
  plannedTurns: design.plannedTurns,
  estimateUsdNoCache:
    (design.plannedTurns *
      (4700 * models[0].prompt + 140 * models[0].completion)) /
    1e6,
};
console.log(
  JSON.stringify({
    prepared: true,
    run,
    plannedTurns: plan.plannedTurns,
    remainingBudgetUsd: maxUsd,
    estimateUsdNoCache: plan.estimateUsdNoCache,
    manifestHash: plan.fingerprint,
  }),
);
if (!run) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
await mkdir(directory, { recursive: true });
const planPath = new URL('plan.json', directory);
const reportPath = new URL('llama-emotional-v4.json', directory);
let previousReport;
try {
  previousReport = JSON.parse(await readFile(reportPath, 'utf8'));
  if (!resume || previousReport.stopped !== 'EVALUATION_HTTP_429')
    throw new Error('Rodada já executada; retomada só após HTTP 429.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (resume && !previousReport) throw new Error('Não há rodada para retomar.');
try {
  const saved = JSON.parse(await readFile(planPath, 'utf8'));
  if (resume) {
    if (fingerprint(saved.frozen) !== saved.fingerprint)
      throw new Error('Manifesto original inválido.');
    const comparable = (value) => {
      const copy = globalThis.structuredClone(value);
      delete copy.maxUsd;
      delete copy.parentBudget;
      delete copy.implementation['scripts/eval-llama-emotional-v4.mjs'];
      return copy;
    };
    if (
      fingerprint(comparable(saved.frozen)) !==
      fingerprint(comparable(plan.frozen))
    )
      throw new Error('Condições do ensaio mudaram; retomada rejeitada.');
    plan = saved;
  } else if (saved.fingerprint !== plan.fingerprint)
    throw new Error('Manifesto congelado divergente.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const completeCase = (item) =>
  item.turns.length === 4 &&
  item.turns.every((turn) => turn.assistant && !turn.errors.length);
const remainingJobs = jobs.filter(
  (job) =>
    !previousReport?.cases.some(
      (item) =>
        completeCase(item) &&
        item.id === job.scenario.id &&
        item.sample === job.sample &&
        item.variant === job.variant &&
        item.phase === job.phase,
    ),
);
const remainingTurns = remainingJobs.reduce(
  (sum, job) => sum + job.scenario.turns.length,
  0,
);
const remainingEstimate =
  (remainingTurns * (4700 * models[0].prompt + 140 * models[0].completion)) /
  1e6;
if (remainingEstimate > maxUsd)
  throw new Error('Estimativa restante acima do saldo autorizado.');
if (resume) {
  const failedCall = previousReport.calls.findLast(
    (call) => call.httpStatus === 429,
  );
  if (
    Date.now() <
    Date.parse(previousReport.completedAt) + (failedCall?.retryAfterMs ?? 60000)
  )
    throw new Error('EVALUATION_ROUTE_COOLDOWN');
  console.log(
    JSON.stringify({
      resumed: true,
      frozenManifestHash: plan.fingerprint,
      remainingTurns,
      remainingEstimateUsd: remainingEstimate,
      remainingBudgetUsd: maxUsd,
    }),
  );
}
const shared = await openSharedEvaluationRound(
  parentDirectory,
  parent.maxUsd,
  parent.manifestHash,
);
try {
  if (shared.snapshot().priorCommittedUsd !== parent.committedUsd)
    throw new Error(
      'Saldo alterado antes do bloqueio; interrompido sem inferência.',
    );
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
      throw new Error('Rota fora do contrato.');
    for (const parameter of ['temperature', 'max_tokens'])
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
} catch (error) {
  await shared.close();
  throw error;
}
const report = previousReport ?? {
  suite: 'llama-emotional-v4-carried-budget',
  createdAt: new Date().toISOString(),
  plan,
  synthetic: true,
  noAudio: true,
  paidJudge: false,
  humanReferenceConfirmed: false,
  priorCommittedUsd: parent.committedUsd,
  calls: [],
  cases: [],
  stopped: null,
  budget: null,
};
if (previousReport) {
  const archive = new URL('interruption-' + Date.now() + '.json', directory);
  await writeFile(archive, JSON.stringify(previousReport, null, 2));
  report.interruptedCases ??= [];
  report.interruptedCases.push(
    ...report.cases.filter((item) => !completeCase(item)),
  );
  report.cases = report.cases.filter(completeCase);
  report.executionEpochs ??= [];
  report.executionEpochs.push({
    resumedAt: new Date().toISOString(),
    priorCommittedUsd: parent.committedUsd,
    executorHash: implementation['scripts/eval-llama-emotional-v4.mjs'],
    minimumRequestGapMs: 2000,
    interruptedSnapshot: archive.pathname,
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
    fetcher: async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) {
        const failed = report.calls.findLast(
          (call) => call.status === 'pending',
        );
        const payload = await response
          .clone()
          .json()
          .catch(() => ({}));
        if (failed)
          failed.remoteFailure = {
            code: payload.error?.code ?? null,
            message: String(payload.error?.message ?? '')
              .replaceAll(process.env.OPENROUTER_API_KEY, '[redacted]')
              .slice(0, 500),
            providerName: payload.error?.metadata?.provider_name ?? null,
            providerDetail: String(payload.error?.metadata?.raw ?? '')
              .replaceAll(process.env.OPENROUTER_API_KEY, '[redacted]')
              .slice(0, 1000),
          };
      }
      return response;
    },
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
          item.sample === sample &&
          item.variant === variant &&
          item.phase === phase,
      )
    )
      continue;
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
          expressiveDirection:
            variant === 'after' ? expressiveDirection : undefined,
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
      if (resume)
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
const summary = await summarizeLlamaEmotionalV4(reportPath, report);
console.log(JSON.stringify({ report: reportPath.pathname, ...summary }));
