import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { ShotBankSchema } from '../src/evaluation/persona/experimental-suite.ts';
import { createEvaluationRouter } from '../src/evaluation/persona/router.ts';
import { createPinnedEvaluationFetch } from '../src/evaluation/persona/pinned-fetch.ts';
import { openSharedEvaluationRound } from '../src/evaluation/persona/shared-round.ts';
import {
  fingerprint,
  textDiagnostics,
} from '../src/evaluation/persona/diagnostics.ts';
import { buildRefinementMessages } from '../src/evaluation/persona/refinement-v3.ts';
import { contextualShotBank } from '../src/evaluation/persona/controlled-refinement.ts';
import { createLocalMemoryEmbeddings } from '../src/adapters/embeddings/local.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { buildVoicePersonaCore } from '../src/application/persona/voice-prompt.ts';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';

const args = process.argv.slice(2);
if (
  args.some((a) => !['--run', '--resume', '--budget=0.27'].includes(a)) ||
  !args.includes('--budget=0.27')
)
  throw new Error('Use --budget=0.27 [--run] [--resume].');
const directory = new URL(
  '../data/refinement/acting-sequences-027-2026-10-08/',
  import.meta.url,
);
const reportPath = new URL('authors.json', directory);
const root = new URL('../../evals/persona/', import.meta.url);
const resources = {};
const read = async (path) => {
  const raw = await readFile(new URL(path, root), 'utf8');
  resources[path] = fingerprint(raw);
  return raw;
};
const suite = JSON.parse(await read('quality-v7/conversations.json'));
const banks = {
  before: ShotBankSchema.parse(
    JSON.parse(await read('quality-v2.1/shots.json')),
  ),
  after: ShotBankSchema.parse(
    JSON.parse(await read('quality-v7/shots-sequences.json')),
  ),
};
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
const model = {
  name: 'llama',
  id: 'meta-llama/llama-3.3-70b-instruct',
  family: 'meta',
  prompt: 0.1,
  completion: 0.32,
  providerOnly: 'deepinfra/turbo',
};
const implementation = {};
for (const path of [
  'scripts/eval-acting-sequences.mjs',
  'src/evaluation/persona/refinement-v3.ts',
  'src/evaluation/persona/controlled-refinement.ts',
  'src/evaluation/persona/router.ts',
  'src/evaluation/persona/pinned-fetch.ts',
  'src/application/voice/turn-processor.ts',
  'src/application/persona/response-stream.ts',
])
  implementation[path] = fingerprint(
    await readFile(new URL('../' + path, import.meta.url), 'utf8'),
  );
const frozen = {
  resources,
  implementation,
  originalCore,
  card,
  direction,
  presence,
  expressiveDirection,
  model,
  temperature: 0.6,
  maxTokens: 512,
  maxExamples: 3,
  totalCap: 0.27,
  authorSoftCap: 0.23,
  developerSamples: 5,
  reservedSamples: 3,
  banks,
  suite,
};
const hash = fingerprint(frozen);
const jobs = [];
for (const [split, scenarios, samples] of [
  ['development', suite.development, 5],
  ['reserved', suite.reserved, 3],
]) {
  for (let sample = 1; sample <= samples; sample++)
    for (const scenario of scenarios) {
      const order =
        (sample + scenarios.indexOf(scenario)) % 2
          ? ['before', 'after']
          : ['after', 'before'];
      jobs.push({ split, sample, scenario, order });
    }
}
console.log(
  JSON.stringify({
    run: args.includes('--run'),
    manifestHash: hash,
    pairedConversations: jobs.length,
    plannedTurns: jobs.reduce((n, j) => n + j.scenario.turns.length * 2, 0),
    capUsd: 0.27,
    judgeMarginUsd: 0.04,
    model,
    noAudio: true,
  }),
);
if (!args.includes('--run')) process.exit(0);
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('OPENROUTER_API_KEY ausente.');
const catalog = await fetch(
  'https://openrouter.ai/api/v1/models/' + model.id + '/endpoints',
  { signal: AbortSignal.timeout(30000) },
);
if (!catalog.ok) throw new Error('Catálogo indisponível.');
const endpoint = (await catalog.json()).data.endpoints.find(
  (e) => e.tag === model.providerOnly,
);
if (
  !endpoint ||
  endpoint.status !== 0 ||
  Number(endpoint.pricing.prompt) * 1e6 > model.prompt + 1e-12 ||
  Number(endpoint.pricing.completion) * 1e6 > model.completion + 1e-12 ||
  Number(endpoint.pricing.request ?? 0) > 0 ||
  !['temperature', 'max_tokens'].every((p) =>
    endpoint.supported_parameters.includes(p),
  )
)
  throw new Error('Rota fora do contrato. Nenhuma chamada paga.');
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
  throw new Error(
    'Resultado existe; retomada exige manifesto idêntico e interrupção registrada.',
  );
if (!report && args.includes('--resume'))
  throw new Error('Não há rodada para retomar.');
if (
  report?.stopped === 'EVALUATION_HTTP_429' &&
  Date.now() <
    Date.parse(report.completedAt) +
      (report.calls.findLast((c) => c.httpStatus === 429)?.retryAfterMs ??
        60000)
)
  throw new Error('EVALUATION_ROUTE_COOLDOWN');
report ??= {
  createdAt: new Date().toISOString(),
  manifestHash: hash,
  noAudio: true,
  humanReference: false,
  calls: [],
  cases: [],
  stopped: null,
};
report.stopped = null;
await writeFile(
  new URL('manifest.json', directory),
  JSON.stringify(
    {
      hash,
      frozen,
      endpoint: { tag: endpoint.tag, pricing: endpoint.pricing },
    },
    null,
    2,
  ),
);
const round = await openSharedEvaluationRound(directory, 0.27, hash);
let writes = Promise.resolve();
const persist = () =>
  (writes = writes.then(() => round.persist(reportPath, report)));
const router = createEvaluationRouter({
  key: process.env.OPENROUTER_API_KEY,
  budget: round.budget,
  calls: report.calls,
  persist,
  fetcher: createPinnedEvaluationFetch({
    models: [model],
    calls: report.calls,
    persist,
  }),
});
const embeddings = createLocalMemoryEmbeddings(
  process.env.MEMORY_MODEL_CACHE_DIRECTORY ??
    fileURLToPath(new URL('../data/models/', import.meta.url)),
);
const pools = {};
const vectors = {};
async function select(arm, query) {
  const [vector] = await embeddings.embed([query], 'query');
  const scores = pools[arm].map((shot, index) => ({
    id: shot.id,
    relevance: vector.reduce(
      (sum, v, i) => sum + v * vectors[arm][index][i],
      0,
    ),
  }));
  return { bank: contextualShotBank(banks[arm], scores, 3), scores };
}
const persona = {
  version: PERSONA_VERSION,
  revision: 0,
  direction: '',
  updatedAt: null,
};
try {
  await persist();
  for (const arm of ['before', 'after']) {
    pools[arm] = banks[arm].shots.filter(
      (s) =>
        banks[arm].levels['1'].includes(s.id) &&
        s.kind === 'style-adaptation' &&
        !s.facts.length,
    );
    vectors[arm] = await embeddings.embed(
      pools[arm].map(
        (s) =>
          s.situation +
          '\n' +
          s.messages
            .map((m) =>
              m.content.replace(/<expression>.*?<\/expression>/su, ''),
            )
            .join('\n'),
      ),
      'passage',
    );
  }
  // Pair is the spending/scheduling unit, not a single arm. Both arms use their own real generated history.
  for (const [jobIndex, job] of jobs.entries()) {
    const key = `${job.split}:${job.scenario.id}:${job.sample}`;
    if (
      job.order.every((arm) =>
        report.cases.some((c) => c.key === key && c.arm === arm && c.complete),
      )
    )
      continue;
    const known = report.calls.filter((c) => c.usage?.cost != null);
    const mean = known.length
      ? known.reduce((n, c) => n + c.usage.cost, 0) / known.length
      : 0.00065;
    if (
      round.snapshot().roundCommittedUsd +
        mean * job.scenario.turns.length * 2 +
        0.008 >
      0.23
    ) {
      report.stopped = 'AUTHOR_MARGIN_FOR_JEV';
      break;
    }
    for (const arm of job.order) {
      if (
        report.cases.some((c) => c.key === key && c.arm === arm && c.complete)
      )
        continue;
      const recent = [];
      const item = {
        key,
        id: job.scenario.id,
        split: job.split,
        sample: job.sample,
        arm,
        turns: [],
        complete: false,
      };
      report.cases.push(item);
      let active;
      const providers = {
        execute: async () => {
          throw new Error('Ensaio sem STT/TTS.');
        },
        executeStream: async function* (input, signal) {
          const started = performance.now();
          const selected = await select(
            arm,
            JSON.stringify({
              history: recent
                .slice(-2)
                .map((t) => ({ user: t.userText, assistant: t.sentText })),
              user: active.user,
            }),
          );
          const messages = buildRefinementMessages({
            variant: 'acting',
            originalCore,
            card,
            direction,
            presence,
            system: input.systemPrompt,
            history: input.history ?? [],
            content: input.content,
            bank: selected.bank,
            memoryBlock: '',
            canonicalMemory: true,
            expressiveDirection,
          });
          const attempt = {
            messages,
            hash: fingerprint(messages),
            selectedIds: selected.bank.levels['1'],
            retrievalScores: selected.scores,
            retrievalMs: performance.now() - started,
            maxTokens: input.maxTokens,
            raw: '',
          };
          active.inputs.push(attempt);
          for await (const chunk of router.stream(
            model,
            messages,
            input.maxTokens,
            'acting-sequences',
            signal,
          )) {
            attempt.raw += chunk.content;
            if (chunk.content.trim())
              active.firstRawTextMs ??= performance.now() - active.started;
            const end = attempt.raw.indexOf('</expression>');
            if (end >= 0 && attempt.raw.slice(end + 13).trim())
              active.firstSpeechTextMs ??= performance.now() - active.started;
            yield chunk;
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
      const processor = createTurnProcessor(
        providers,
        history,
        createVoiceMetrics(),
        { get: async () => persona },
        {
          retrieve: async () => '',
          interruptBackground: () => {},
          validateContext: async () => true,
          reviewMode: async () => 'selective',
          verifyAnswer: async () => null,
        },
      );
      const conversationId = randomUUID();
      for (const [index, user] of job.scenario.turns.entries()) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
        active = {
          user,
          assistant: '',
          history: globalThis.structuredClone(recent),
          inputs: [],
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
              ownerId: 'synthetic-acting-v7',
              turnId: index + 1,
              responseId: randomUUID(),
              dataClass: 'synthetic',
              text: user,
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
                if (event.type === 'error' && event.code !== 'VOICE_NOT_READY')
                  active.errors.push(event.code);
              },
            },
          );
        } catch (error) {
          active.errors.push(error.message);
          if (/^EVALUATION_/u.test(error.message))
            report.stopped = error.message;
        }
        active.elapsedMs = performance.now() - active.started;
        active.callIds = report.calls.slice(firstCall).map((c) => c.id);
        const callError = report.calls
          .slice(firstCall)
          .find(
            (c) => c.httpStatus === 429 || /^EVALUATION_/u.test(c.error ?? ''),
          );
        if (callError)
          report.stopped =
            callError.httpStatus === 429
              ? 'EVALUATION_HTTP_429'
              : callError.error;
        active.diagnostics = textDiagnostics(
          active.assistant,
          pools[arm].flatMap((s) =>
            s.messages
              .filter((m) => m.role === 'assistant')
              .map((m) =>
                m.content.replace(/<expression>.*?<\/expression>/su, ''),
              ),
          ),
          recent.map((t) => t.sentText),
        );
        recent.push({
          userText: user,
          generatedText: '',
          sentText: active.assistant,
          dataClass: 'synthetic',
          responseStatus: active.errors.length ? 'failed' : 'completed',
          partiallyPlayed: false,
        });
        await persist();
        console.log(
          JSON.stringify({
            pair: jobIndex + 1,
            totalPairs: jobs.length,
            scenario: item.id,
            arm,
            sample: job.sample,
            turn: index + 1,
            errors: active.errors,
            committedUsd: round.snapshot().roundCommittedUsd,
          }),
        );
        if (active.errors.length || report.stopped) break;
      }
      item.complete =
        item.turns.length === job.scenario.turns.length &&
        item.turns.every((t) => t.assistant && !t.errors.length);
      await persist();
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
    stopped: report.stopped,
    completeConversations: report.cases.filter((c) => c.complete).length,
    paidCalls: report.calls.length,
    budget: report.budget,
  }),
);
