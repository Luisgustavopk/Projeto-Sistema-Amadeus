import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createEvaluationRouter } from '../src/evaluation/persona/router.ts';
import { createPinnedEvaluationFetch } from '../src/evaluation/persona/pinned-fetch.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import {
  fingerprint,
  textDiagnostics,
  quantiles,
} from '../src/evaluation/persona/diagnostics.ts';
import {
  buildExperimentalMessages,
  parseScenarioDataset,
  ShotBankSchema,
} from '../src/evaluation/persona/experimental-suite.ts';
import { buildVoicePersonaCore } from '../src/application/persona/voice-prompt.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';

// Default uses the historical remainder. Three-model preparation never spends.
const args = process.argv.slice(2);
if (args.some((arg) => !['--run', '--three-models'].includes(arg)))
  throw new Error(
    'Use --three-models e/ou --run; preparar não inicia inferência.',
  );
const run = args.includes('--run');
const threeModels = args.includes('--three-models');
const directory = new URL(
  '../data/refinement/' + (threeModels ? 'models-three-005/' : ''),
  import.meta.url,
);
const suiteRoot = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const sourceRoot = new URL('../../evals/persona/quality-v2/', import.meta.url);
let previous;
try {
  previous = JSON.parse(
    await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
  );
} catch (error) {
  if (!threeModels || error.code !== 'ENOENT') throw error;
  previous = { round: 'quality-v2.1', maxUsd: 0.05, committedUsd: 0 };
}
const originalManifest = JSON.parse(
  await readFile(new URL('manifest.json', suiteRoot), 'utf8'),
);
if (
  previous.round !== 'quality-v2.1' ||
  previous.maxUsd !== (threeModels ? 0.05 : 0.25) ||
  !Number.isFinite(previous.committedUsd) ||
  previous.committedUsd < 0 ||
  (!threeModels && previous.manifestHash !== fingerprint(originalManifest))
) {
  throw new Error('A rodada original não corresponde ao orçamento autorizado.');
}
const remaining = previous.maxUsd - previous.committedUsd;
if (!(remaining > 0 && remaining <= (threeModels ? 0.05 : 0.01995) + 1e-12))
  throw new Error('Saldo fora da autorização desta comparação.');

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
    prompt: 0.045,
    completion: 0.3,
    providerOnly: 'inference-net/fp8',
    disableReasoning: true,
  },
];
if (threeModels)
  models.push({
    name: 'qwen25',
    id: 'qwen/qwen-2.5-72b-instruct',
    family: 'qwen',
    prompt: 0.36,
    completion: 0.4,
    providerOnly: 'deepinfra/fp8',
  });
const selections = {
  development: ['D01', 'D02', 'D05'],
  memory: ['M01', 'M03'],
  initiative: ['I01'],
};
const scenarios = [];
const sources = {};
for (const [split, ids] of Object.entries(selections)) {
  const raw = await readFile(new URL(split + '.json', sourceRoot), 'utf8');
  sources[split] = fingerprint(raw);
  const dataset = parseScenarioDataset(raw);
  for (const id of ids) {
    const scenario = dataset.cases.find((item) => item.id === id);
    if (!scenario) throw new Error('Cenário ausente.');
    scenarios.push({ ...scenario, split });
  }
}
const card = (
  await readFile(new URL('core-card.md', suiteRoot), 'utf8')
).trim();
const direction = (
  await readFile(new URL('turn-direction.md', suiteRoot), 'utf8')
).trim();
const bank = ShotBankSchema.parse(
  JSON.parse(await readFile(new URL('shots.json', suiteRoot), 'utf8')),
);
const originalCore = buildVoicePersonaCore(true, false);
const samples = threeModels ? 1 : 2;
const frozen = {
  models,
  scenarios,
  sources,
  card,
  direction,
  bank,
  samples,
  variant: 'card-shots',
  level: '1',
  temperature: 0.6,
  originalCore,
  originalManifest,
};
const implementation = {};
for (const path of [
  'scripts/compare-llama-deepseek.mjs',
  'src/evaluation/persona/router.ts',
  'src/evaluation/persona/pinned-fetch.ts',
  'src/evaluation/persona/shared-round.ts',
  'src/evaluation/persona/budget.ts',
  'src/evaluation/persona/experimental-suite.ts',
  'src/application/voice/turn-processor.ts',
  'src/application/persona/speech-recovery.ts',
  'src/application/persona/voice-prompt.ts',
])
  implementation[path] = fingerprint(
    await readFile(new URL('../' + path, import.meta.url), 'utf8'),
  );

const endpoints = [];
for (const model of models) {
  const response = await fetch(
    'https://openrouter.ai/api/v1/models/' + model.id + '/endpoints',
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error('Catálogo de endpoints indisponível.');
  const item = (await response.json()).data.endpoints.find(
    (endpoint) => endpoint.tag === model.providerOnly,
  );
  if (
    !item ||
    item.status !== 0 ||
    Number(item.pricing.prompt) * 1e6 > model.prompt + 1e-12 ||
    Number(item.pricing.completion) * 1e6 > model.completion + 1e-12 ||
    Number(item.pricing.request ?? 0) > 0
  )
    throw new Error('Rota ausente ou preço fora do teto: ' + model.name);
  for (const parameter of [
    'temperature',
    'max_tokens',
    ...(model.disableReasoning ? ['reasoning'] : []),
  ]) {
    if (!item.supported_parameters.includes(parameter))
      throw new Error('Parâmetro não suportado: ' + parameter);
  }
  endpoints.push({
    model: model.id,
    endpoint: item.tag,
    provider: item.provider_name,
    pricing: item.pricing,
    parameters: item.supported_parameters,
  });
}
const plan = {
  frozen,
  fingerprint: fingerprint({ frozen, implementation }),
  implementation,
  endpoints,
  remainingUsd: remaining,
  maxNewSpendUsd: remaining,
  plannedTurns:
    scenarios.reduce((sum, scenario) => sum + scenario.turns.length, 0) *
    samples *
    models.length,
  estimate: {
    inputTokensPerTurn: 3800,
    outputTokensPerTurn: 70,
    cachedTokens: 0,
    models: models.map((model) => ({
      model: model.name,
      usd:
        (scenarios.reduce((sum, scenario) => sum + scenario.turns.length, 0) *
          samples *
          (3800 * model.prompt + 70 * model.completion)) /
        1e6,
    })),
  },
  run,
};
const ledgerHash = threeModels ? plan.fingerprint : previous.manifestHash;
if (
  threeModels &&
  previous.manifestHash &&
  previous.manifestHash !== ledgerHash
)
  throw new Error('Rodada dos três modelos congelada: manifesto divergente.');
plan.estimate.totalUsd = plan.estimate.models.reduce(
  (sum, model) => sum + model.usd,
  0,
);
if (!run) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL(
      threeModels ? 'models-three-plan.json' : 'llama-deepseek-plan.json',
      directory,
    ),
    JSON.stringify(plan, null, 2),
  );
  console.log(
    JSON.stringify({
      prepared: true,
      paidCalls: 0,
      plannedTurns: plan.plannedTurns,
      estimate: plan.estimate,
      remainingUsd: remaining,
      routes: endpoints,
    }),
  );
} else {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error('Chave OpenRouter ausente.');
  const shared = await openSharedEvaluationRound(
    directory,
    previous.maxUsd,
    ledgerHash,
  );
  const reportPath = new URL(Date.now() + '-llama-deepseek.json', directory);
  const report = {
    suite: threeModels ? 'llama-deepseek-qwen25-pilot' : 'llama-deepseek-pilot',
    createdAt: new Date().toISOString(),
    plan,
    noAudio: true,
    synthetic: true,
    paidJudge: false,
    priorReport: previous.report,
    priorCommittedUsd: previous.committedUsd,
    calls: [],
    cases: [],
    stopped: null,
    budget: null,
  };
  const persist = () => shared.persist(reportPath, report);
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
  const persona = {
    version: PERSONA_VERSION,
    revision: 0,
    direction: '',
    updatedAt: null,
  };
  const examples = bank.levels['1'].flatMap((id) =>
    bank.shots
      .find((shot) => shot.id === id)
      .messages.filter((m) => m.role === 'assistant')
      .map((m) => m.content.replace(/<expression>.*?<\/expression>/su, '')),
  );
  try {
    await persist();
    outer: for (let sample = 1; sample <= samples; sample++) {
      for (const [scenarioIndex, scenario] of scenarios.entries()) {
        const offset = (sample + scenarioIndex) % models.length;
        const ordered = [...models.slice(offset), ...models.slice(0, offset)];
        for (const model of ordered) {
          const recent = JSON.parse(JSON.stringify(scenario.history ?? []));
          const facts = (scenario.facts ?? []).map((text, index) => ({
            id: 'fixture-' + index,
            version: 1,
            text,
            dataClass: 'synthetic',
            kind: 'fact',
            expiresAt: null,
          }));
          const item = {
            id: scenario.id,
            split: scenario.split,
            domain: scenario.domain,
            expectation: scenario.expectation,
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
              const messages = buildExperimentalMessages({
                variant: 'card-shots',
                originalCore,
                card,
                direction,
                system: input.systemPrompt,
                history: input.history ?? [],
                content: input.content,
                bank,
                level: '1',
              });
              active.inputs.push({
                messages,
                maxTokens: input.maxTokens,
                facts,
                hash: fingerprint(messages),
              });
              let raw = '';
              try {
                for await (const chunk of router.stream(
                  model,
                  messages,
                  input.maxTokens,
                  'conversation',
                  signal,
                )) {
                  active.rawReply += chunk.content;
                  raw += chunk.content;
                  if (chunk.content.trim())
                    active.firstRawTextMs ??=
                      performance.now() - active.started;
                  const end = raw.indexOf('</expression>');
                  if (end >= 0 && raw.slice(end + 13).trim())
                    active.firstSpeechTextMs ??=
                      performance.now() - active.started;
                  yield chunk;
                }
              } catch (error) {
                if (
                  /^EVALUATION_(BUDGET_EXHAUSTED|PRICE_CEILING_VIOLATION|HTTP_40[123])$/u.test(
                    error.message,
                  )
                )
                  report.stopped = error.message;
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
            acknowledge: async () => true,
          };
          const metrics = createVoiceMetrics();
          const recordingMetrics = {
            ...metrics,
            time(stage, ms) {
              metrics.time(stage, ms);
              if (active) (active.stageDurations[stage] ??= []).push(ms);
            },
          };
          const processor = createTurnProcessor(
            providers,
            history,
            recordingMetrics,
            { get: async () => persona },
            {
              retrieve: async () =>
                facts.length ? JSON.stringify({ facts }) : '',
              interruptBackground: () => {},
              validateContext: async () => true,
              reviewMode: async () => 'selective',
              verifyAnswer: async () => null,
            },
          );
          const conversationId = randomUUID();
          for (const [index, turn] of scenario.turns.entries()) {
            const initiativeKind =
              typeof turn === 'string' ? undefined : turn.initiativeKind;
            active = {
              user: typeof turn === 'string' ? turn : '',
              initiativeKind,
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
            try {
              await processor.process(
                {
                  sessionId: conversationId,
                  conversationId,
                  ownerId: 'synthetic-pilot',
                  turnId: index + 1,
                  responseId: randomUUID(),
                  dataClass: 'synthetic',
                  text: active.user,
                  initiativeKind,
                  profile: null,
                  signal: AbortSignal.timeout(60000),
                  speechEndedAt: active.started,
                },
                {
                  send(event) {
                    if (event.type === 'reply.text') {
                      active.firstUsableTextMs ??=
                        performance.now() - active.started;
                      active.assistant +=
                        (active.assistant ? ' ' : '') + event.text;
                    }
                    if (event.type === 'reply.expression')
                      active.expression = event;
                    if (
                      event.type === 'error' &&
                      event.code !== 'VOICE_NOT_READY'
                    )
                      active.errors.push(event.code);
                  },
                },
              );
            } catch {
              active.errors.push('EVALUATION_TURN_FAILED');
            }
            active.totalMs = performance.now() - active.started;
            active.callIds = report.calls
              .slice(firstCall)
              .map((call) => call.id);
            active.diagnostics = textDiagnostics(
              active.assistant,
              examples,
              recent.map((entry) => entry.sentText ?? ''),
            );
            recent.push({
              userText: active.user,
              initiativeKind,
              generatedText: '',
              sentText: active.assistant,
              dataClass: 'synthetic',
              responseStatus: active.errors.length ? 'failed' : 'completed',
              partiallyPlayed: false,
            });
            await persist();
            console.log(
              JSON.stringify({
                scenario: item.id,
                sample,
                model: model.name,
                turn: index + 1,
                errors: active.errors,
                firstTextMs: active.firstUsableTextMs,
                spentUsd:
                  shared.snapshot().roundCommittedUsd - previous.committedUsd,
              }),
            );
            if (report.stopped) break outer;
            if (active.errors.length) break;
          }
        }
      }
    }
  } finally {
    report.completedAt = new Date().toISOString();
    await persist();
    await shared.close();
  }
  const summary = models.map((model) => {
    const cases = report.cases.filter((item) => item.model === model.name);
    const attempted = cases.flatMap((item) => item.turns);
    const turns = attempted.filter(
      (turn) => turn.assistant && !turn.errors.length,
    );
    const calls = report.calls.filter((call) => call.model === model.id);
    return {
      model: model.name,
      completeConversations: cases.filter(
        (item) =>
          item.turns.length === 3 &&
          item.turns.every((turn) => turn.assistant && !turn.errors.length),
      ).length,
      turns: turns.length,
      attempted: attempted.length,
      errors: attempted.filter((turn) => turn.errors.length).length,
      words: quantiles(turns.map((turn) => turn.diagnostics.words)),
      questionsPerTurn: turns.length
        ? turns.reduce((sum, turn) => sum + turn.diagnostics.questions, 0) /
          turns.length
        : null,
      firstRawMs: quantiles(turns.map((turn) => turn.firstRawTextMs)),
      firstSpeechMs: quantiles(turns.map((turn) => turn.firstSpeechTextMs)),
      firstUsableMs: quantiles(turns.map((turn) => turn.firstUsableTextMs)),
      completeMs: quantiles(turns.map((turn) => turn.totalMs)),
      expressionValid: turns.filter((turn) => turn.expression?.metadataValid)
        .length,
      calls: calls.length,
      providers: [...new Set(calls.map((call) => call.provider))],
      reportedUsd: calls.reduce(
        (sum, call) => sum + (call.usage?.cost ?? 0),
        0,
      ),
      inputTokens: calls.reduce(
        (sum, call) => sum + (call.usage?.prompt_tokens ?? 0),
        0,
      ),
      outputTokens: calls.reduce(
        (sum, call) => sum + (call.usage?.completion_tokens ?? 0),
        0,
      ),
      cacheTokens: calls.reduce(
        (sum, call) =>
          sum + (call.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        0,
      ),
    };
  });
  const pairs = [];
  for (const scenario of scenarios) {
    for (let sample = 1; sample <= samples; sample++) {
      const candidates = models.map((model) =>
        report.cases.find(
          (item) =>
            item.id === scenario.id &&
            item.sample === sample &&
            item.model === model.name,
        ),
      );
      if (candidates.some((item) => !item)) continue;
      for (let index = 0; index < 3; index++) {
        const turns = candidates.map((item) => item.turns[index]);
        if (turns.some((turn) => !turn?.assistant || turn.errors.length))
          continue;
        const offset =
          (scenario.id.charCodeAt(0) + sample + index) % models.length;
        const order = models.map((_model, i) => (i + offset) % models.length);
        const ordered = order.map((i) => turns[i]);
        const id = fingerprint({
          scenario: scenario.id,
          sample,
          index,
          report: reportPath.pathname,
        }).slice(0, 12);
        pairs.push({
          id,
          scenario: scenario.id,
          sample,
          turn: index + 1,
          expectation: scenario.expectation,
          facts: scenario.facts ?? [],
          user: turns[0].user,
          initiativeKind: turns[0].initiativeKind,
          sameInput: turns.every(
            (turn) => turn.inputs[0]?.hash === turns[0].inputs[0]?.hash,
          ),
          ...Object.fromEntries(
            ordered.map((turn, i) => [
              String.fromCharCode(65 + i),
              { history: turn.history, reply: turn.assistant },
            ]),
          ),
          privateModels: order.map((i) => models[i].name),
        });
      }
    }
  }
  const audit = {
    report: reportPath.pathname,
    fingerprint: fingerprint(report),
    summary,
    spentUsd: report.budget.roundCommittedUsd - previous.committedUsd,
    remainingUsd: previous.maxUsd - report.budget.roundCommittedUsd,
    stopped: report.stopped,
    sameInitialInputs: pairs
      .filter((pair) => pair.turn === 1)
      .map((pair) => ({
        scenario: pair.scenario,
        sample: pair.sample,
        sameInput: pair.sameInput,
      })),
    limitations: [
      'Ensaio exploratório: no máximo duas amostras por cenário; sem significância ou certificação de persona.',
      'Histórico inicial, núcleo, exemplos, contratos, fatos e temperatura iguais; após a primeira fala, o histórico incorpora a resposta de cada modelo.',
      'Compara modelo e rota. PAD persistente, busca/extração de memória, STT, TTS e agendamento de iniciativa não são avaliados.',
      'Sem juiz pago: avaliações automáticas são somente diagnósticos. Aprovação humana de persona continua pendente.',
      'O orçamento histórico é preservado; a comparação dos três tem diretório e teto próprios, sem regenerar o manifesto histórico.',
    ],
  };
  await writeFile(
    new URL(reportPath.href.replace('.json', '-summary.json')),
    JSON.stringify(audit, null, 2),
  );
  await writeFile(
    new URL(reportPath.href.replace('.json', '-pairs-private.json')),
    JSON.stringify(pairs, null, 2),
  );
  const blind = pairs.map((pair) => {
    const value = { ...pair };
    delete value.privateModels;
    return value;
  });
  await writeFile(
    new URL(reportPath.href.replace('.json', '-blind.json')),
    JSON.stringify(blind, null, 2),
  );
  const markdown =
    `# Comparação cega Llama × DeepSeek${threeModels ? ' × Qwen2.5' : ''}\n\nAvalie ${threeModels ? 'A/B/C' : 'A/B'} por interlocução, persona, continuidade e sustentação factual; empates e incerteza são válidos. Os históricos de seguimento são próprios de cada resposta.\n\n` +
    blind
      .map(
        (pair) =>
          `## ${pair.id}\n\n${pair.expectation}\n\nFatos: ${JSON.stringify(pair.facts)}\n\nUsuário: ${pair.user || '[iniciativa]'}\n\n` +
          models
            .map((_model, i) => {
              const label = String.fromCharCode(65 + i);
              return `Histórico ${label}: ${JSON.stringify(pair[label].history)}\n\n${label}: ${pair[label].reply}\n`;
            })
            .join('\n'),
      )
      .join('\n');
  await writeFile(
    new URL(reportPath.href.replace('.json', '-blind.md')),
    markdown,
  );
  console.log(JSON.stringify({ report: reportPath.pathname, ...audit }));
}
