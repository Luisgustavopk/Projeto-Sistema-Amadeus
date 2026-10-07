import {
  mkdir,
  readFile,
  writeFile,
  open,
  unlink,
  rename,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createClient } from '@libsql/client';
import { createEvaluationBudget } from '../src/evaluation/persona/budget.ts';
import {
  createEvaluationRouter,
  evaluationModels,
} from '../src/evaluation/persona/router.ts';
import {
  contamination,
  fingerprint,
  textDiagnostics,
} from '../src/evaluation/persona/diagnostics.ts';
import { summarizeQualityReport } from './lib/conversation-quality-report.mjs';
import { parseVerdict } from '../src/evaluation/persona/judge.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { buildVoicePersonaCore } from '../src/application/persona/voice-prompt.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../src/application/persona/presence-reference.ts';
import { buildPresenceDirection } from '../src/application/persona/presence-direction.ts';
import { createPersonaConfiguration } from '../src/application/persona/configuration.ts';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { createPersistentPersonaState } from '../src/application/persona/persistent-state.ts';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';

const root = new URL('../../evals/persona/quality-v2/', import.meta.url);
const directory = new URL('../data/refinement/', import.meta.url);
const args = process.argv.slice(2);
const option = (key, fallback) =>
  args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ??
  fallback;
const allowed = ['only', 'models', 'variants', 'samples', 'split', 'budget'];
if (
  args.some(
    (arg) =>
      arg !== '--run' && !allowed.some((key) => arg.startsWith(`--${key}=`)),
  )
)
  throw new Error('Argumento desconhecido.');
const split = option('split', 'heldout');
if (!['development', 'heldout', 'regression'].includes(split))
  throw new Error('Conjunto inválido.');
const samples = Number(option('samples', '5'));
if (!Number.isInteger(samples) || samples < 5 || samples > 10)
  throw new Error('Use 5–10 amostras por conversa.');
const modelNames = option('models', 'llama').split(',');
const variants = option('variants', 'current,compact').split(',');
if (
  modelNames.some((name) => !Object.hasOwn(evaluationModels, name)) ||
  new Set(modelNames).size !== modelNames.length
)
  throw new Error('Modelos inválidos.');
if (
  variants.some((name) => !['current', 'compact'].includes(name)) ||
  new Set(variants).size !== variants.length
)
  throw new Error('Variantes inválidas.');
const maxUsd = Number(option('budget', '0.25'));
if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 0.25)
  throw new Error('Esta rodada autoriza até US$ 0,25 no total.');
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
for (const [file, hash] of Object.entries(manifest.files)) {
  if (fingerprint(await readFile(new URL(file, root), 'utf8')) !== hash)
    throw new Error(`Conjunto ou recurso alterado após congelamento: ${file}`);
}
const dataset = JSON.parse(
  await readFile(new URL(`${split}.json`, root), 'utf8'),
);
const only = option('only', '').split(',').filter(Boolean);
if (only.some((id) => !dataset.cases.some((scenario) => scenario.id === id)))
  throw new Error('Cenário desconhecido.');
const scenarios = dataset.cases.filter(
  (scenario) => !only.length || only.includes(scenario.id),
);
const core = (await readFile(new URL('core-positive.md', root), 'utf8')).trim();
const directive = (
  await readFile(new URL('turn-direction.md', root), 'utf8')
).trim();
const rubric = (await readFile(new URL('rubric.md', root), 'utf8')).trim();
const dev = await readFile(new URL('development.json', root), 'utf8');
const baseCore = buildVoicePersonaCore(true, false);
const baselineSources = [
  baseCore,
  PERSONA_PRESENCE_REFERENCE,
  buildPresenceDirection('greeting'),
  buildPresenceDirection('initiative'),
];
const overlap = contamination(dataset.cases, [
  ...baselineSources,
  core,
  directive,
  dev,
]);
if (split === 'heldout' && overlap.length)
  throw new Error(
    `Sobreposição literal detectada no conjunto reservado: ${JSON.stringify(overlap)}`,
  );
const plannedTurns =
  scenarios.reduce((sum, scenario) => sum + scenario.turns.length, 0) *
  samples *
  modelNames.length *
  variants.length;
console.log(
  JSON.stringify({
    split,
    cases: scenarios.length,
    samples,
    models: modelNames,
    variants,
    plannedTurns,
    maxUsd,
    coreCharacters: core.length,
    overlap,
    noAudio: true,
    run: args.includes('--run'),
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('Configure OPENROUTER_API_KEY.');
await mkdir(directory, { recursive: true });
const lockPath = new URL('quality-v2.lock', directory);
const lock = await open(lockPath, 'wx'); // Concurrent runs must not each spend the cap.
let database;

try {
  const ledgerPath = new URL('quality-v2-budget.json', directory);
  let previous;
  try {
    previous = JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const prior = previous?.committedUsd ?? 0;
  if (
    !Number.isFinite(prior) ||
    prior < 0 ||
    (previous && previous.round !== 'quality-v2-first-round')
  )
    throw new Error('Registro de orçamento inválido.');
  if (prior >= maxUsd) throw new Error('EVALUATION_BUDGET_EXHAUSTED');
  const budget = createEvaluationBudget(maxUsd - prior);
  const reportPath = new URL(`${Date.now()}-quality-v2.json`, directory);
  const report = {
    createdAt: new Date().toISOString(),
    personaVersion: PERSONA_VERSION,
    split,
    datasetHash: fingerprint(dataset),
    manifest,
    samples,
    plannedTurns,
    models: modelNames,
    variants,
    synthetic: true,
    noAudio: true,
    limitations: [
      'Juiz independente ainda não calibrado por humanos.',
      'Memórias são fixtures; busca, extração e áudio não são avaliados.',
      'O ensaio usa o processador real sem Jev de análise e sem persistir o perfil do proprietário.',
      'Compact troca o núcleo e remove o complemento fixo de presença; mantém contratos e contexto do processador. Tokens e amostragem são iguais ao controle.',
      'Limites de preço são exclusivos da avaliação; configuração de produção não é alterada.',
      'Intervalos por turno são descritivos; turnos da mesma conversa são correlacionados.',
      'Modelos usam provedores distintos do OpenRouter; comparação mede modelo e rota.',
    ],
    calls: [],
    cases: [],
    budget: null,
    stopped: null,
  };
  const persist = async () => {
    report.budget = {
      ...budget.snapshot(),
      roundMaxUsd: maxUsd,
      priorCommittedUsd: prior,
      roundCommittedUsd: prior + budget.snapshot().committedUsd,
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    const temp = new URL('quality-v2-budget.tmp', directory);
    await writeFile(
      temp,
      JSON.stringify(
        {
          round: 'quality-v2-first-round',
          maxUsd,
          committedUsd: report.budget.roundCommittedUsd,
          report: reportPath.pathname,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    await rename(temp, ledgerPath);
  };
  // Price and parameter checks precede all inference requests.
  const catalogResponse = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(30000),
  });
  if (!catalogResponse.ok) throw new Error('Catálogo indisponível.');
  const catalog = (await catalogResponse.json()).data;
  const usedModels = new Set([
    ...modelNames,
    'gemini',
    ...(modelNames.includes('gemini') ? ['qwen'] : []),
  ]);
  report.catalog = [];
  for (const name of usedModels) {
    const model = evaluationModels[name];
    const item = catalog.find((entry) => entry.id === model.id);
    if (
      !item ||
      Number(item.pricing.prompt) * 1e6 > model.prompt ||
      Number(item.pricing.completion) * 1e6 > model.completion ||
      Number(item.pricing.request ?? 0) > 0
    )
      throw new Error(`Preço fora do teto da avaliação: ${name}`);
    for (const parameter of [
      'temperature',
      'max_tokens',
      ...(name === 'gemini' || name === 'qwen' ? ['response_format'] : []),
    ]) {
      if (!item.supported_parameters.includes(parameter))
        throw new Error(`Parâmetro indisponível: ${name}/${parameter}`);
    }
    report.catalog.push({
      id: item.id,
      pricing: item.pricing,
      supportedParameters: item.supported_parameters,
    });
  }
  database = createClient({
    url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
  });
  const personaConfiguration = await createPersonaConfiguration(
    createRevisionRepository(database),
    process.env.OWNER_ID ?? 'primary',
  ).get();
  database.close();
  database = undefined;
  if (
    split === 'heldout' &&
    contamination(dataset.cases, [personaConfiguration.direction]).length
  )
    throw new Error('Diretriz administrativa sobrepõe teste reservado.');
  report.administrativeDirection = personaConfiguration;
  report.promptSourceHash = fingerprint([
    ...baselineSources,
    personaConfiguration.direction,
  ]);
  report.pipelineHash = fingerprint(
    await readFile(
      new URL('../src/application/voice/turn-processor.ts', import.meta.url),
      'utf8',
    ),
  );
  const router = createEvaluationRouter({
    key: process.env.OPENROUTER_API_KEY,
    budget,
    calls: report.calls,
    persist,
  });
  const cells = modelNames.flatMap((model) =>
    variants.map((variant) => ({ model, variant })),
  );
  await persist();

  outer: for (const scenario of scenarios) {
    for (let sample = 0; sample < samples; sample++) {
      // Rotating order balances which cells are attempted first if the cap stops us.
      const ordered = cells.map(
        (_, index) => cells[(index + sample) % cells.length],
      );
      for (const cell of ordered) {
        const item = {
          id: scenario.id,
          domain: scenario.domain,
          expectation: scenario.expectation ?? scenario.criteria,
          sample: sample + 1,
          ...cell,
          turns: [],
        };
        report.cases.push(item);
        const recent = (scenario.history ?? []).map((turn) => ({ ...turn }));
        const stateDatabase = createClient({ url: ':memory:' });
        await stateDatabase.execute(
          'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
        const stateRepository = createRevisionRepository(stateDatabase);
        const stateOwner = randomUUID();
        const persistentState = createPersistentPersonaState(
          stateRepository,
          stateOwner,
        );
        const metrics = createVoiceMetrics();
        let activeTurn;
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
        const facts = (scenario.facts ?? []).map((text, index) => ({
          id: `fixture-${index}`,
          version: 1,
          text,
          dataClass: 'synthetic',
          kind: 'fact',
          expiresAt: null,
        }));
        const providers = {
          execute: async () => {
            throw new Error('O ensaio proíbe STT/TTS.');
          },
          executeStream: async function* (input, signal) {
            let systemPrompt = input.systemPrompt;
            if (cell.variant === 'compact') {
              if (!systemPrompt.includes(baseCore))
                throw new Error('Núcleo do prompt não encontrado.');
              systemPrompt =
                systemPrompt
                  .replace(baseCore, core)
                  .replace(PERSONA_PRESENCE_REFERENCE, '') +
                '\n' +
                directive;
            }
            const messages = [
              { role: 'system', content: systemPrompt },
              ...(input.history ?? []),
              { role: 'user', content: input.content },
            ];
            activeTurn.inputs.push({ original: input, messages, facts });
            for await (const chunk of router.stream(
              evaluationModels[cell.model],
              messages,
              input.maxTokens,
              'conversation',
              signal,
            )) {
              activeTurn.rawReply += chunk.content;
              if (chunk.content.trim())
                activeTurn.firstRawTextMs ??=
                  performance.now() - activeTurn.started;
              const end = activeTurn.rawReply.indexOf('</expression>');
              if (end >= 0 && activeTurn.rawReply.slice(end + 13).trim())
                activeTurn.firstSpeechTextMs ??=
                  performance.now() - activeTurn.started;
              yield chunk;
            }
          },
        };
        const processor = createTurnProcessor(
          providers,
          history,
          metrics,
          { get: async () => personaConfiguration },
          {
            retrieve: async () =>
              facts.length ? JSON.stringify({ facts }) : '',
            interruptBackground: () => {},
            validateContext: async () => true,
            reviewMode: async () => 'selective',
            verifyAnswer: async () => null,
          },
          undefined,
          persistentState,
        );
        const conversationId = randomUUID();
        try {
          for (const [index, turn] of scenario.turns.entries()) {
            const initiativeKind =
              typeof turn === 'string' ? undefined : turn.initiativeKind;
            activeTurn = {
              user: typeof turn === 'string' ? turn : '',
              ...(initiativeKind ? { initiativeKind } : {}),
              assistant: '',
              rawReply: '',
              inputs: [],
              facts,
              history: JSON.parse(JSON.stringify(recent)),
              started: performance.now(),
              errors: [],
              verdict: null,
            };
            item.turns.push(activeTurn);
            const firstCall = report.calls.length;
            try {
              await processor.process(
                {
                  sessionId: conversationId,
                  conversationId,
                  ownerId: stateOwner,
                  turnId: index + 1,
                  responseId: randomUUID(),
                  dataClass: 'synthetic',
                  text: activeTurn.user,
                  ...(initiativeKind ? { initiativeKind } : {}),
                  profile: null,
                  signal: AbortSignal.timeout(60000),
                  speechEndedAt: activeTurn.started,
                },
                {
                  send(event) {
                    if (event.type === 'reply.text') {
                      activeTurn.firstUsableTextMs ??=
                        performance.now() - activeTurn.started;
                      activeTurn.assistant +=
                        (activeTurn.assistant ? ' ' : '') + event.text;
                    }
                    if (event.type === 'reply.expression')
                      activeTurn.expression = event;
                    if (
                      event.type === 'error' &&
                      event.code !== 'VOICE_NOT_READY'
                    )
                      activeTurn.errors.push(event.code);
                  },
                },
              );
            } catch {
              activeTurn.errors.push('EVALUATION_TURN_FAILED');
            }
            activeTurn.totalMs = performance.now() - activeTurn.started;
            activeTurn.callIds = report.calls
              .slice(firstCall)
              .map((call) => call.id);
            const failures = report.calls
              .slice(firstCall)
              .filter((call) => call.status === 'failed');
            const fatal = failures.find((call) =>
              [
                'EVALUATION_PRICE_CEILING_VIOLATION',
                'EVALUATION_HTTP_401',
                'EVALUATION_HTTP_402',
                'EVALUATION_HTTP_403',
              ].includes(call.error),
            );
            if (
              fatal ||
              budget.snapshot().committedUsd >= maxUsd - prior ||
              (activeTurn.errors.length && report.calls.length === firstCall)
            ) {
              report.stopped =
                fatal?.error ?? 'EVALUATION_BUDGET_OR_PROCESSOR_FAILURE';
              break outer;
            }
            activeTurn.diagnostics = textDiagnostics(
              activeTurn.assistant,
              baselineSources,
              recent.map((entry) => entry.sentText),
            );
            if (activeTurn.assistant && !activeTurn.errors.length) {
              const judgeName = cell.model === 'gemini' ? 'qwen' : 'gemini';
              activeTurn.judgeModel = evaluationModels[judgeName].id;
              let verdictText = '';
              try {
                for await (const chunk of router.stream(
                  evaluationModels[judgeName],
                  [
                    {
                      role: 'system',
                      content:
                        rubric +
                        '\nEvidências curtas, até 120 caracteres cada. Para applicable:false use pass:null.',
                    },
                    {
                      role: 'user',
                      content: JSON.stringify({
                        expectation: item.expectation,
                        facts,
                        history: activeTurn.history,
                        user: activeTurn.user,
                        initiativeKind,
                        assistant: activeTurn.assistant,
                      }),
                    },
                  ],
                  900,
                  'judge',
                  AbortSignal.timeout(60000),
                  { temperature: 0 },
                  true,
                ))
                  verdictText += chunk.content;
                activeTurn.verdict = parseVerdict(verdictText);
              } catch (error) {
                activeTurn.judgeError =
                  error.message === 'EVALUATION_BUDGET_EXHAUSTED'
                    ? error.message
                    : 'JUDGE_FAILED_OR_INVALID';
                if (activeTurn.judgeError === 'EVALUATION_BUDGET_EXHAUSTED') {
                  report.stopped = activeTurn.judgeError;
                  break outer;
                }
              }
              activeTurn.rawVerdict = verdictText;
            }
            recent.push({
              userText: activeTurn.user,
              ...(initiativeKind ? { initiativeKind } : {}),
              generatedText: '',
              sentText: activeTurn.assistant,
              dataClass: 'synthetic',
              responseStatus: activeTurn.errors.length ? 'failed' : 'completed',
              partiallyPlayed: false,
            });
            await persist();
            console.log(
              JSON.stringify({
                case: scenario.id,
                sample: sample + 1,
                ...cell,
                turn: index + 1,
                words: activeTurn.diagnostics.words,
                errors: activeTurn.errors,
                spentUsd: report.budget.roundCommittedUsd,
              }),
            );
            if (activeTurn.errors.length) break;
          }
        } finally {
          item.metrics = metrics.snapshot();
          item.artisticState = await persistentState.snapshot('synthetic');
          stateDatabase.close();
        }
      }
    }
  }
  const { markdown, calibration, calibrationMarkdown } = summarizeQualityReport(
    report,
    scenarios,
  );
  await persist();
  await writeFile(new URL(reportPath.href.replace('.json', '.md')), markdown);
  await writeFile(
    new URL(reportPath.href.replace('.json', '-calibration.md')),
    calibrationMarkdown,
  );
  await writeFile(
    new URL(reportPath.href.replace('.json', '-calibration.json')),
    JSON.stringify(calibration, null, 2),
  );

  console.log(
    JSON.stringify({
      report: reportPath.pathname,
      budget: report.budget,
      completedTurns: report.completedTurns,
      stopped: report.stopped,
    }),
  );
} finally {
  database?.close();
  await lock.close();
  await unlink(lockPath);
}
