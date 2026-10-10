import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { ReadableStream } from 'node:stream/web';
import { createEvaluationRouter } from '../src/evaluation/persona/router.ts';
import { createPinnedEvaluationFetch } from '../src/evaluation/persona/pinned-fetch.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import {
  fingerprint,
  textDiagnostics,
} from '../src/evaluation/persona/diagnostics.ts';
import { ShotBankSchema } from '../src/evaluation/persona/experimental-suite.ts';
import { buildRefinementMessages } from '../src/evaluation/persona/refinement-v3.ts';
import { functionPassages } from '../src/evaluation/persona/isolated-examples.ts';
import {
  groupedActingMessages,
  rankInteractionFunctions,
} from '../src/evaluation/persona/sequence-selection.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import {
  buildVoicePersonaCore,
  voiceOutputFormat,
} from '../src/application/persona/voice-prompt.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../src/application/persona/presence-reference.ts';
import { streamSpeech } from '../src/application/voice/speech-stream.ts';
import { validateSpokenSegment } from '../src/application/persona/response-stream.ts';
import { expressionObserverPrompt } from '../src/application/persona/expression-observer-prompt.ts';
import { ExpressionSchema } from '../src/domain/persona/expression.ts';

const args = process.argv.slice(2);
const phase =
  args.find((arg) => arg.startsWith('--phase='))?.slice(8) ?? 'authors';
if (
  !['authors', 'observers'].includes(phase) ||
  args.some((arg) => arg !== '--run' && !arg.startsWith('--phase='))
)
  throw new Error('Use [--run] [--phase=authors|observers].');
const directory = new URL(
  '../data/refinement/reactions-v9-015/',
  import.meta.url,
);
const root = new URL('../../evals/persona/', import.meta.url);
const resourceHashes = {};
async function readResource(name) {
  const text = await readFile(new URL(name, root), 'utf8');
  resourceHashes[name] = fingerprint(text);
  return text;
}
const suite = JSON.parse(await readResource('quality-v9/conversations.json'));
const scenes = JSON.parse(await readResource('quality-v9/revised-scenes.json'));
const bank = ShotBankSchema.parse(
  JSON.parse(await readResource('quality-v7/shots-sequences.json')),
);
// Candidates contain speech only. Keep the historical header-bearing contract
// unchanged and validate the new data boundary without inventing metadata.
for (const [id, messages] of Object.entries(scenes.scenes)) {
  const shot = bank.shots.find((item) => item.id === id);
  if (
    !shot ||
    shot.kind !== 'style-adaptation' ||
    shot.facts.length ||
    !Array.isArray(messages) ||
    messages.length < 2 ||
    messages.length % 2 ||
    messages.some(
      (message, index) =>
        message.role !== (index % 2 ? 'assistant' : 'user') ||
        typeof message.content !== 'string' ||
        !message.content.trim(),
    )
  )
    throw new Error('INVALID_CANDIDATE_SCENE');
}
const candidateBank = {
  ...bank,
  shots: bank.shots.map((shot) =>
    scenes.scenes[shot.id]
      ? {
          ...shot,
          messages: scenes.scenes[shot.id],
          adaptationNote: shot.adaptationNote + '\n' + scenes.provenance,
        }
      : shot,
  ),
};
const card = (await readResource('quality-v2.1/core-card.md')).trim();
const direction = (await readResource('quality-v2.1/turn-direction.md')).trim();
const presence = (await readResource('quality-v3/presence-positive.md')).trim();
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
for (const name of [
  'scripts/eval-reactions-v9.mjs',
  'src/evaluation/persona/sequence-selection.ts',
  'src/application/persona/expression-observer-prompt.ts',
  'src/application/voice/speech-stream.ts',
  'src/evaluation/persona/shared-round.ts',
  'src/evaluation/persona/budget.ts',
  'src/evaluation/persona/router.ts',
  'src/evaluation/persona/pinned-fetch.ts',
  'src/evaluation/persona/refinement-v3.ts',
  'src/domain/persona/expression.ts',
])
  implementation[name] = fingerprint(
    await readFile(new URL('../' + name, import.meta.url), 'utf8'),
  );
const frozen = {
  resourceHashes,
  implementation,
  suite,
  scenes,
  functions,
  models,
  originalCore,
  expressiveDirection,
  card,
  direction,
  presence,
  capUsd: 0.15,
  temperature: 0.6,
  maxTokens: 512,
  firstFlushMs: [700, 200],
  observerPrompts: [
    expressionObserverPrompt(false),
    expressionObserverPrompt(true),
  ],
  noAudio: true,
  productionChanged: false,
  observerInputScope:
    'first 700ms segment; identical input for both observer prompts; classification runs separately from measured author generation',
};
const hash = fingerprint(frozen);
const groups = [
  ...suite.development.map((scenario) => ({ split: 'development', scenario })),
  ...suite.reserved.map((scenario) => ({ split: 'reserved', scenario })),
];
console.log(
  JSON.stringify({
    run: args.includes('--run'),
    phase,
    hash,
    authorCalls: groups.reduce(
      (sum, group) => sum + group.scenario.turns.length * 4,
      0,
    ),
    observerCalls: groups.reduce(
      (sum, group) => sum + group.scenario.turns.length * 4,
      0,
    ),
    capUsd: frozen.capUsd,
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
    (entry) => entry.tag === model.providerOnly,
  );
  if (
    !endpoint ||
    endpoint.status !== 0 ||
    Number(endpoint.pricing.prompt) * 1e6 > model.prompt + 1e-10 ||
    Number(endpoint.pricing.completion) * 1e6 > model.completion + 1e-10 ||
    Number(endpoint.pricing.request ?? 0) > 0 ||
    !['temperature', 'max_tokens', 'response_format'].every((parameter) =>
      endpoint.supported_parameters.includes(parameter),
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
const reportPath = new URL('results.json', directory);
let report;
if (phase === 'authors') {
  report = {
    createdAt: new Date().toISOString(),
    manifestHash: hash,
    calls: [],
    cases: [],
    noAudio: true,
    productionChanged: false,
    stopped: null,
  };
  await writeFile(reportPath, JSON.stringify(report), { flag: 'wx' });
  await writeFile(
    new URL('manifest.json', directory),
    JSON.stringify({ hash, frozen, endpoints }, null, 2),
    { flag: 'wx' },
  );
} else {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (
    report.manifestHash !== hash ||
    !report.authorsCompletedAt ||
    report.stopped ||
    report.observersStartedAt
  )
    throw new Error('FROZEN_ROUND_OR_PHASE_INCOMPLETE');
  report.observersStartedAt = new Date().toISOString();
}
const round = await openSharedEvaluationRound(directory, frozen.capUsd, hash);
const persist = () => round.persist(reportPath, report);
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
const embeddings =
  phase === 'authors'
    ? createLocalMemoryEmbeddings(
        process.env.MEMORY_MODEL_CACHE_DIRECTORY ??
          fileURLToPath(new URL('../data/models/', import.meta.url)),
      )
    : null;

try {
  await persist();
  if (phase === 'authors') {
    const vectors = await embeddings.embed(
      functions.map((reference) => reference.description),
      'passage',
    );
    const core = buildRefinementMessages({
      variant: 'acting',
      originalCore,
      card,
      direction,
      presence,
      system:
        originalCore + '\n' + PERSONA_PRESENCE_REFERENCE + voiceOutputFormat(0),
      history: [],
      content: '',
      bank,
      memoryBlock: '',
      canonicalMemory: true,
      expressiveDirection,
      plain: true,
    })[0].content;
    for (const [groupIndex, group] of groups.entries()) {
      const selections = [];
      for (const [index, user] of group.scenario.turns.entries()) {
        const started = performance.now();
        const input = [
          user,
          ...(index
            ? [
                group.scenario.turns
                  .slice(Math.max(0, index - 2), index)
                  .join('\n'),
              ]
            : []),
        ];
        const [current, previous] = await embeddings.embed(input, 'query');
        const scores = rankInteractionFunctions(
          functions,
          vectors,
          current,
          previous,
        );
        selections.push({
          ids: scores.slice(0, 3).map((entry) => entry.id),
          scores,
          query: input,
          preparationMs: performance.now() - started,
        });
      }
      const arms =
        groupIndex % 2 ? ['revised', 'control'] : ['control', 'revised'];
      const order = groupIndex % 2 ? [...models].reverse() : models;
      for (const arm of arms)
        for (const model of order) {
          const item = {
            key: `${group.scenario.id}:${model.name}:${arm}`,
            id: group.scenario.id,
            focus: group.scenario.focus,
            split: group.split,
            model: model.name,
            arm,
            turns: [],
            complete: false,
          };
          report.cases.push(item);
          const history = [];
          for (const [index, user] of group.scenario.turns.entries()) {
            const selection = selections[index];
            const examples = selection.ids.map((id) => ({
              id,
              description: functions.find((reference) => reference.id === id)
                .description,
              messages: (arm === 'control' ? bank : candidateBank).shots.find(
                (shot) => shot.id === id,
              ).messages,
            }));
            const messages = groupedActingMessages({
              system: core,
              examples,
              history,
              user,
            });
            const turn = {
              user,
              history: globalThis.structuredClone(history),
              messages,
              selection,
              chunks: [],
              segmentations: {},
              raw: '',
              errors: [],
            };
            item.turns.push(turn);
            const started = performance.now();
            const signal = AbortSignal.timeout(45000);
            const purpose = `author:${item.key}:${index}`;
            const readable = new ReadableStream({
              async start(controller) {
                try {
                  for await (const chunk of router.stream(
                    model,
                    messages,
                    512,
                    purpose,
                    signal,
                  ))
                    if (chunk.content) {
                      turn.firstRawTextMs ??= performance.now() - started;
                      turn.chunks.push({
                        atMs: performance.now() - started,
                        content: chunk.content,
                      });
                      turn.raw += chunk.content;
                      controller.enqueue(chunk.content);
                    }
                  turn.generationMs = performance.now() - started;
                  controller.close();
                } catch (error) {
                  controller.error(error);
                }
              },
            });
            const [left, right] = readable.tee();
            const compared = await Promise.allSettled(
              [left, right].map(async (stream, offset) => {
                const firstFlushMs = frozen.firstFlushMs[offset];
                const result = (turn.segmentations[firstFlushMs] = {
                  segments: [],
                  firstUsableMs: null,
                  text: '',
                });
                for await (const segment of streamSpeech(() => stream, signal, {
                  firstFlushMs,
                })) {
                  const usable = validateSpokenSegment(segment);
                  if (usable) {
                    const atMs = performance.now() - started;
                    result.firstUsableMs ??= atMs;
                    result.segments.push({ atMs, text: usable });
                    result.text += (result.text ? ' ' : '') + usable;
                  }
                }
              }),
            );
            for (const result of compared)
              if (result.status === 'rejected')
                turn.errors.push(result.reason.message);
            turn.assistant = turn.segmentations[700].text;
            turn.equivalentText =
              turn.segmentations[700].text === turn.segmentations[200].text;
            if (!turn.equivalentText)
              turn.errors.push('SEGMENTATION_TEXT_CHANGED');
            turn.diagnostics = textDiagnostics(
              turn.assistant,
              examples.flatMap((example) =>
                example.messages
                  .filter((message) => message.role === 'assistant')
                  .map((message) =>
                    message.content.replace(
                      /^<expression>.*?<\/expression>\s*/su,
                      '',
                    ),
                  ),
              ),
              history
                .filter((message) => message.role === 'assistant')
                .map((message) => message.content),
            );
            history.push(
              { role: 'user', content: user },
              { role: 'assistant', content: turn.assistant },
            );
            await persist();
            console.log(
              JSON.stringify({
                phase,
                scenario: item.id,
                model: model.name,
                arm,
                turn: index + 1,
                first700Ms: turn.segmentations[700].firstUsableMs,
                first200Ms: turn.segmentations[200].firstUsableMs,
                committedUsd: round.snapshot().roundCommittedUsd,
                errors: turn.errors,
              }),
            );
            if (turn.errors.length) {
              report.stopped = turn.errors[0];
              break;
            }
          }
          item.complete =
            item.turns.length === group.scenario.turns.length &&
            item.turns.every((turn) => turn.assistant && !turn.errors.length);
          await persist();
          if (report.stopped) throw new Error(report.stopped);
        }
    }
    report.authorsCompletedAt = new Date().toISOString();
  } else {
    for (const item of report.cases.filter(
      (candidate) => candidate.arm === 'revised' && candidate.complete,
    ))
      for (const [index, turn] of item.turns.entries()) {
        turn.observers = {};
        const input = {
          history: turn.history.slice(-6),
          user: turn.user,
          speech: turn.segmentations[700].segments[0].text,
        };
        for (const [promptIndex, system] of frozen.observerPrompts.entries()) {
          const name = promptIndex ? 'anchored' : 'control';
          const messages = [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(input) },
          ];
          const result = (turn.observers[name] = {
            input,
            raw: '',
            proposal: null,
            valid: false,
            error: null,
          });
          const started = performance.now();
          try {
            for await (const chunk of router.stream(
              models[1],
              messages,
              160,
              `observer:${item.key}:${index}:${name}`,
              AbortSignal.timeout(20000),
              { temperature: 0 },
              true,
            ))
              result.raw += chunk.content;
            result.proposal = ExpressionSchema.parse(JSON.parse(result.raw));
            result.valid = true;
          } catch (error) {
            result.error = error.message;
            if (/^EVALUATION_/u.test(result.error))
              report.stopped = result.error;
          }
          result.durationMs = performance.now() - started;
          await persist();
          if (report.stopped) throw new Error(report.stopped);
        }
        console.log(
          JSON.stringify({
            phase,
            scenario: item.id,
            model: item.model,
            turn: index + 1,
            control: turn.observers.control.proposal,
            anchored: turn.observers.anchored.proposal,
            committedUsd: round.snapshot().roundCommittedUsd,
          }),
        );
      }
    report.observersCompletedAt = new Date().toISOString();
  }
} catch (error) {
  report.stopped ??= error.message;
} finally {
  try {
    await persist();
  } finally {
    await round.close();
    await embeddings?.close();
  }
}
console.log(
  JSON.stringify({
    phase,
    completeConversations: report.cases.filter((item) => item.complete).length,
    stopped: report.stopped,
    budget: report.budget,
  }),
);
if (report.stopped) process.exitCode = 1;
