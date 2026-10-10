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
import { openDatabase } from '../src/adapters/database/index.ts';
import { createPersonaReferenceRepository } from '../src/adapters/database/persona-reference-repository.ts';
import {
  loadPersonaReferenceCatalog,
  personaCatalogUrl,
  personaExamplesUrl,
} from '../src/application/persona/reference-catalog.ts';
import { createPersonaReferenceRetrieval } from '../src/application/persona/reference-retrieval.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import { createLocalMemoryReranker } from '../src/adapters/embeddings/reranker.ts';
import { fileURLToPath } from 'node:url';
import {
  buildExperimentalMessages,
  parseScenarioDataset,
  ShotBankSchema,
} from '../src/evaluation/persona/experimental-suite.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';

const root = new URL('../../evals/persona/quality-v2/', import.meta.url);
const directory = new URL('../data/refinement/', import.meta.url);
const args = process.argv.slice(2);
const option = (key, fallback) =>
  args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ??
  fallback;
const allowed = [
  'suite',
  'shots',
  'judge',
  'only',
  'models',
  'variants',
  'samples',
  'split',
  'budget',
  'turn-length',
  'presence-examples',
];
if (
  args.some(
    (arg) =>
      arg !== '--run' && !allowed.some((key) => arg.startsWith(`--${key}=`)),
  )
)
  throw new Error('Argumento desconhecido.');
const suite = option('suite', 'quality-v2');
if (!['quality-v2', 'quality-v2.1'].includes(suite))
  throw new Error('Suite desconhecida.');
const experimental = suite === 'quality-v2.1';
const suiteRoot = experimental
  ? new URL('../../evals/persona/quality-v2.1/', import.meta.url)
  : root;
const shotLevel = option('shots', '1');
const selectedJudge = option('judge', 'gemini');
if (
  !['1', '2'].includes(shotLevel) ||
  !['gemini', 'qwen', 'kimi'].includes(selectedJudge)
)
  throw new Error('Exemplos ou juiz inválidos.');
if (
  !experimental &&
  args.some((a) => a.startsWith('--shots=') || a.startsWith('--judge='))
)
  throw new Error('shots/judge pertencem à v2.1.');
const referenceExperiment = option('variants', '').includes('examples-');
const split = option(
  'split',
  referenceExperiment || experimental ? 'development' : 'heldout',
);
if (
  !['development', 'heldout', 'regression', 'memory', 'initiative'].includes(
    split,
  )
)
  throw new Error('Conjunto inválido.');
const samples = Number(option('samples', experimental ? '10' : '5'));
if (!Number.isInteger(samples) || samples < 5 || samples > 10)
  throw new Error('Use 5–10 amostras por conversa.');
if (experimental && samples < 10)
  throw new Error('A v2.1 exige dez amostras por conversa.');
const modelNames = option('models', 'llama').split(',');
const variants = option(
  'variants',
  experimental ? 'current,card' : 'current,compact',
).split(',');
if (
  experimental &&
  (modelNames.join(',') !== 'llama' ||
    variants.some((v) => !['current', 'card', 'card-shots'].includes(v)))
)
  throw new Error('v2.1: autor Llama; braços current/card/card-shots.');
const turnLength = option('turn-length', 'baseline');
if (!['baseline', 'brief'].includes(turnLength)) {
  throw new Error('Use turn-length=baseline ou brief.');
}
const lengthDirective =
  turnLength === 'brief' ? '\nNeste turno, fale em uma ou duas frases.' : '';
const presenceExamples = option('presence-examples', 'baseline');
if (
  !['baseline', 'omit'].includes(presenceExamples) ||
  (presenceExamples === 'omit' && split !== 'initiative')
) {
  throw new Error(
    'presence-examples=omit é exclusivo do diagnóstico de iniciativa.',
  );
}
const baselineInitiative = buildPresenceDirection('initiative');
const exampleStart = baselineInitiative.indexOf('\nExemplo fictício:\n');
const exampleEnd = baselineInitiative.indexOf(
  '\nNão insista em assuntos recusados.',
);
if (
  presenceExamples === 'omit' &&
  (exampleStart < 0 || exampleEnd <= exampleStart)
) {
  throw new Error('Bloco de exemplos de iniciativa não encontrado.');
}
const initiativeWithoutExamples =
  baselineInitiative.slice(0, exampleStart) +
  baselineInitiative.slice(exampleEnd);
if (
  referenceExperiment &&
  variants.some((name) => !name.startsWith('examples-'))
)
  throw new Error(
    'Compare os braços examples separadamente dos braços current/compact.',
  );
if (
  modelNames.some((name) => !Object.hasOwn(evaluationModels, name)) ||
  new Set(modelNames).size !== modelNames.length
)
  throw new Error('Modelos inválidos.');
if (
  variants.some(
    (name) =>
      !(
        experimental
          ? ['current', 'card', 'card-shots']
          : [
              'current',
              'compact',
              'examples-0',
              'examples-2',
              'examples-4',
              'examples-6',
            ]
      ).includes(name),
  ) ||
  new Set(variants).size !== variants.length
)
  throw new Error('Variantes inválidas.');
const maxUsd = Number(option('budget', experimental ? undefined : '0.25'));
if (
  !Number.isFinite(maxUsd) ||
  maxUsd <= 0 ||
  maxUsd > (experimental ? 5 : 0.25)
)
  throw new Error(
    experimental
      ? 'A v2.1 exige --budget explícito (máximo US$ 5); preparar não autoriza execução paga.'
      : 'Esta rodada autoriza até US$ 0,25 no total.',
  );
if (
  experimental &&
  (turnLength !== 'baseline' || presenceExamples !== 'baseline')
)
  throw new Error(
    'Isole ficha e exemplos; controles de tamanho/presença ficam iguais na v2.1.',
  );
const suiteManifest = experimental
  ? JSON.parse(await readFile(new URL('manifest.json', suiteRoot), 'utf8'))
  : undefined;
if (suiteManifest)
  for (const [file, hash] of Object.entries(suiteManifest.files)) {
    if (fingerprint(await readFile(new URL(file, suiteRoot), 'utf8')) !== hash)
      throw new Error('Recurso v2.1 alterado após congelamento: ' + file);
  }
const shotBank = experimental
  ? ShotBankSchema.parse(
      JSON.parse(await readFile(new URL('shots.json', suiteRoot), 'utf8')),
    )
  : undefined;
const card = experimental
  ? (await readFile(new URL('core-card.md', suiteRoot), 'utf8')).trim()
  : '';
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
for (const [file, hash] of Object.entries(manifest.files)) {
  if (fingerprint(await readFile(new URL(file, root), 'utf8')) !== hash)
    throw new Error(`Conjunto ou recurso alterado após congelamento: ${file}`);
}
let diagnosticManifest;
if (split === 'memory' || split === 'initiative') {
  diagnosticManifest = JSON.parse(
    await readFile(new URL('diagnostics-manifest.json', root), 'utf8'),
  );
  for (const [file, hash] of Object.entries(diagnosticManifest.files)) {
    if (fingerprint(await readFile(new URL(file, root), 'utf8')) !== hash) {
      throw new Error(`Diagnóstico alterado após congelamento: ${file}`);
    }
  }
}
const dataset = parseScenarioDataset(
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
  await readFile(new URL('turn-direction.md', suiteRoot), 'utf8')
).trim();
const rubric = (await readFile(new URL('rubric.md', suiteRoot), 'utf8')).trim();
const exampleCatalog = referenceExperiment
  ? await loadPersonaReferenceCatalog(false)
  : [];
const exampleMarkdown = referenceExperiment
  ? await readFile(personaExamplesUrl, 'utf8')
  : '';
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
  exampleMarkdown,
  card,
  ...(shotBank
    ? shotBank.shots.flatMap((s) => s.messages.map((m) => m.content))
    : []),
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
    suite,
    split,
    cases: scenarios.length,
    samples,
    models: modelNames,
    variants,
    turnLength,
    presenceExamples,
    plannedTurns,
    maxUsd,
    ...(experimental
      ? {
          judge: selectedJudge,
          shotLevel,
          actualDemonstrations: variants.includes('card-shots')
            ? shotBank.levels[shotLevel].length
            : 0,
          sharedBudgetForAuthorAndJudges: true,
          productionChanged: false,
        }
      : {}),
    coreCharacters: experimental
      ? undefined
      : referenceExperiment
        ? baseCore.length
        : core.length,
    ...(experimental
      ? {
          actingCoreCharacters: {
            current: baseCore.length,
            card: card.length,
            'card-shots': card.length,
          },
        }
      : {}),
    overlap,
    noAudio: true,
    run: args.includes('--run'),
    ...(referenceExperiment
      ? {
          referenceExperiment: {
            core: 'current',
            maxExamples: variants.map((name) => Number(name.split('-')[1])),
            maxLore: 0,
            characters: 6000,
            bankEntries: exampleCatalog.filter(
              (entry) => entry.kind === 'style',
            ).length,
          },
        }
      : {}),
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('Configure OPENROUTER_API_KEY.');
await mkdir(directory, { recursive: true });
const lockPath = new URL('quality-v2.lock', directory);
const sharedRound = experimental
  ? await openSharedEvaluationRound(
      directory,
      maxUsd,
      fingerprint(suiteManifest),
    )
  : undefined;
const lock = experimental ? undefined : await open(lockPath, 'wx'); // Concurrent runs must not each spend the cap.
let database;
let referenceDatabase;
let referenceEmbeddings;
let referenceReranker;
let referenceRetrieval;

try {
  const ledgerPath = new URL('quality-v2-budget.json', directory);
  let previous;
  try {
    previous = JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const prior =
    sharedRound?.snapshot().priorCommittedUsd ?? previous?.committedUsd ?? 0;
  const round = experimental
    ? 'quality-v2.1'
    : (previous?.round ?? 'quality-v2-first-round');
  if (
    !Number.isFinite(prior) ||
    prior < 0 ||
    ![
      'quality-v2-first-round',
      'quality-v2-llama-small-steps-round-2',
      'quality-v2.1',
    ].includes(round)
  )
    throw new Error('Registro de orçamento inválido.');
  if (prior >= maxUsd) throw new Error('EVALUATION_BUDGET_EXHAUSTED');
  const budget = sharedRound?.budget ?? createEvaluationBudget(maxUsd - prior);
  const reportPath = new URL(`${Date.now()}-${suite}.json`, directory);
  const report = {
    suite,
    ...(experimental
      ? {
          suiteManifest,
          shotLevel,
          selectedJudge,
          demonstrations: shotBank,
          corpusReferenceProfile: JSON.parse(
            await readFile(
              new URL('corpus-reference-profile.json', suiteRoot),
              'utf8',
            ),
          ),
          cardHash: fingerprint(card),
        }
      : {}),
    round,
    createdAt: new Date().toISOString(),
    personaVersion: PERSONA_VERSION,
    split,
    datasetHash: fingerprint(dataset),
    manifest,
    ...(diagnosticManifest ? { diagnosticManifest } : {}),
    samples,
    plannedTurns,
    models: modelNames,
    variants,
    turnLength,
    lengthDirective,
    lengthDirectiveHash: fingerprint(lengthDirective),
    presenceExamples,
    ...(presenceExamples === 'omit'
      ? {
          initiativeDirection: initiativeWithoutExamples,
          initiativeDirectionHash: fingerprint(initiativeWithoutExamples),
        }
      : {}),
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
      ...(referenceExperiment
        ? [
            'Examples-0/2/4/6 mantêm o núcleo atual e variam só o teto de exemplos; lore está desativado. Quantidade efetiva depende da relevância e é registrada. Busca local entra na latência; nota humana continua pendente.',
          ]
        : []),
    ],
    calls: [],
    cases: [],
    budget: null,
    stopped: null,
  };
  const persist = async () => {
    if (sharedRound) {
      await sharedRound.persist(reportPath, report);
      return;
    }
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
          round,
          ...(previous?.previousRound
            ? { previousRound: previous.previousRound }
            : {}),
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
    experimental ? selectedJudge : 'gemini',
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
      ...(name === 'gemini' ||
      name === 'qwen' ||
      (experimental && name === selectedJudge)
        ? ['response_format']
        : []),
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
  if (referenceExperiment) {
    report.referenceResources = {
      catalog: fingerprint(await readFile(personaCatalogUrl, 'utf8')),
      markdown: fingerprint(exampleMarkdown),
      entries: exampleCatalog,
      maxLore: 0,
      characters: 6000,
    };
    referenceDatabase = await openDatabase('file::memory:');
    const repository = createPersonaReferenceRepository(
      referenceDatabase.client,
    );
    await repository.synchronize(exampleCatalog);
    const cacheDirectory =
      process.env.MEMORY_MODEL_CACHE_DIRECTORY ??
      fileURLToPath(new URL('../data/models/', import.meta.url));
    referenceEmbeddings = createLocalMemoryEmbeddings(cacheDirectory);
    referenceReranker = createLocalMemoryReranker(cacheDirectory);
    referenceRetrieval = createPersonaReferenceRetrieval(
      repository,
      referenceEmbeddings,
      undefined,
      referenceReranker,
    );
    await referenceRetrieval.start();
    await referenceRetrieval.index();
    await referenceRetrieval.warm();
  }
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
        const recordingMetrics = {
          ...metrics,
          time(stage, milliseconds) {
            metrics.time(stage, milliseconds);
            if (activeTurn) {
              (activeTurn.stageDurations[stage] ??= []).push(milliseconds);
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
            systemPrompt += lengthDirective;
            if (
              presenceExamples === 'omit' &&
              activeTurn.initiativeKind === 'initiative'
            ) {
              if (!systemPrompt.includes(baselineInitiative))
                throw new Error(
                  'Direção de iniciativa não encontrada no prompt.',
                );
              systemPrompt = systemPrompt.replace(
                baselineInitiative,
                initiativeWithoutExamples,
              );
            }
            const messages = [
              { role: 'system', content: systemPrompt },
              ...(input.history ?? []),
              { role: 'user', content: input.content },
            ];
            if (experimental)
              messages.splice(
                0,
                messages.length,
                ...buildExperimentalMessages({
                  variant: cell.variant,
                  originalCore: baseCore,
                  card,
                  direction: directive,
                  system: systemPrompt,
                  history: input.history ?? [],
                  content: input.content,
                  bank: shotBank,
                  level: shotLevel,
                }),
              );
            activeTurn.inputs.push({ original: input, messages, facts });
            activeTurn.firstProviderCallStartMs ??=
              performance.now() - activeTurn.started;
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
          recordingMetrics,
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
          cell.variant.startsWith('examples-')
            ? {
                retrieve: async (query, signal, options) => {
                  const started = performance.now();
                  const selected = await referenceRetrieval.retrieve(
                    query,
                    signal,
                    {
                      ...options,
                      maxExamples: Number(cell.variant.split('-')[1]),
                      maxLore: 0,
                      characters: 6000,
                      waitMs: 30000,
                    },
                  );
                  activeTurn.references = {
                    state: selected.state,
                    ids: selected.examples.map((entry) => entry.id),
                    provenance: selected.examples.map((entry) => ({
                      id: entry.id,
                      sources: entry.provenance,
                    })),
                    characters: selected.characters,
                    milliseconds: performance.now() - started,
                  };
                  return selected;
                },
              }
            : undefined,
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
              stageDurations: {},
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
              const judgeName = experimental
                ? selectedJudge
                : cell.model === 'gemini'
                  ? 'qwen'
                  : 'gemini';
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
  await referenceRetrieval?.close();
  await referenceEmbeddings?.close();
  await referenceReranker?.close();
  referenceDatabase?.client.close();
  database?.close();
  if (sharedRound) await sharedRound.close();
  else {
    await lock.close();
    await unlink(lockPath);
  }
}
