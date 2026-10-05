import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createProviderStreaming } from '../src/application/providers/streaming.ts';
import { providerAttempts } from '../src/application/providers/fallback.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';
import { ProviderSchema } from '../src/domain/providers/model.ts';
import { buildVoiceContext } from '../src/application/voice/context.ts';
import {
  buildPersonaPrompt,
  buildSpeechOnlyPersonaPrompt,
} from '../src/application/persona/prompt.ts';
import { streamPersonaSpeech } from '../src/application/persona/speech-recovery.ts';
import { createExpressionState } from '../src/domain/persona/expression-policy.ts';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';
import { screenPersonaResponse } from '../src/domain/persona/evaluation.ts';
import { buildCompactPersonaPrompt } from '../src/application/persona/compact-prompt.ts';
import {
  readPersonaResponse,
  validateSpokenSegment,
} from '../src/application/persona/response-stream.ts';

const allowed = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
];
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ??
  fallback;
const models = option('models', allowed.slice(0, 2).join(',')).split(',');
const ids = option('cases', '').split(',').filter(Boolean);
const mode = args.includes('--speech-only') ? 'speech-only' : 'expression';
const compact = args.includes('--compact');
const interval = Number(option('interval-ms', '25000'));

async function main() {
  if (
    models.some((model) => !allowed.includes(model)) ||
    new Set(models).size !== models.length ||
    !Number.isInteger(interval) ||
    interval < 1000 ||
    interval > 60000
  ) {
    throw new Error(
      'Selecione candidatos conhecidos e intervalo entre 1000 e 60000 ms.',
    );
  }
  const suite = JSON.parse(
    await readFile(
      new URL('../../evals/persona/behavior-v1.json', import.meta.url),
      'utf8',
    ),
  );
  if (ids.some((id) => !suite.cases.some((item) => item.id === id)))
    throw new Error('Cenário desconhecido.');
  const cases = suite.cases.filter(
    (item) => !ids.length || ids.includes(item.id),
  );
  if (!args.includes('--run')) {
    console.log(
      `${models.length} modelos, ${cases.length * 3} turnos por modelo, modo ${mode}. Use --run para consumir a cota normal. Não altera configuração ou limites.`,
    );
    return;
  }
  const config = loadConfig();
  const database = await openDatabase(config.DATABASE_URL);
  const directory = resolve('data/persona-evals/comparison');
  await mkdir(directory, { recursive: true });
  const timestamp = Date.now();
  const originalFetch = globalThis.fetch;
  let retryAfter = null;
  globalThis.fetch = async (...input) => {
    const response = await originalFetch(...input);
    if (
      response.status === 429 &&
      response.url.startsWith('https://api.groq.com/')
    ) {
      const delay = Number(response.headers.get('retry-after'));
      retryAfter =
        Number.isFinite(delay) && delay > 0 && delay <= 60 ? delay : null;
    }
    return response;
  };
  try {
    const stored = await new SqliteProviderConfigurationRepository(
      database.client,
    ).get(config.OWNER_ID);
    const base = providerAttempts('llm', stored.llm).find(
      (item) => item.adapter === 'groq',
    );
    if (!base)
      throw new Error('Configure uma credencial Groq antes da comparação.');
    for (const model of models) {
      const selected = ProviderSchema.parse({
        ...base,
        model,
        thinkingLevel: 'low',
      });
      const services = createProviderStreaming(
        {
          get: async () => ({ ...stored, llm: selected }),
          save: async () => {
            throw new Error('A comparação não altera provedores.');
          },
        },
        new SqliteProviderUsageRepository(database.client),
        config.OWNER_ID,
        createProviderFactory(process.env),
        new ActivityGate(1),
      );
      const prompt = compact
        ? buildCompactPersonaPrompt(undefined, mode === 'speech-only')
        : mode === 'speech-only'
          ? buildSpeechOnlyPersonaPrompt()
          : buildPersonaPrompt();
      const report = {
        createdAt: new Date().toISOString(),
        suiteVersion: suite.version,
        personaVersion: PERSONA_VERSION,
        model,
        mode,
        promptVariant: compact ? 'compact-v1' : 'full',
        pipelineSha256: createHash('sha256')
          .update(
            [
              readPersonaResponse.toString(),
              validateSpokenSegment.toString(),
              streamPersonaSpeech.toString(),
              buildVoiceContext.toString(),
            ].join('\n'),
          )
          .digest('hex'),
        metadataRequested: mode !== 'speech-only',
        maxTokens: 1024,
        promptSha256: createHash('sha256').update(prompt).digest('hex'),
        prompt,
        dataClass: 'synthetic',
        productionChanged: false,
        methodology:
          'Conversas independentes, respostas reais encadeadas. Texto considerado confirmado somente neste ensaio. Sem STT/TTS; avaliação humana pendente. Reservas e limites locais normais.',
        results: [],
        failedAttempts: [],
      };
      const file = resolve(
        directory,
        `${timestamp}-${model.replaceAll('/', '-')}-${mode}${compact ? '-compact' : ''}.json`,
      );
      const save = () =>
        writeFile(file, JSON.stringify(report, null, 2) + '\n');
      let blocked = false;
      for (const scenario of cases) {
        const history = globalThis.structuredClone(scenario.history);
        const state = createExpressionState();
        for (const [index, text] of scenario.turns.entries()) {
          for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, interval));
            const result = {
              id: scenario.id,
              category: scenario.category,
              turn: index + 1,
              inputText: text,
              rawResponses: [],
              text: '',
              metadataValid: false,
              recoveries: 0,
              firstSegmentMs: null,
              durationMs: null,
              errorCode: null,
            };
            const started = performance.now();
            const segments = [];
            let proposal = state.snapshot();
            retryAfter = null;
            try {
              async function* source(signal, recovery) {
                const raw = {
                  speechOnly: recovery || mode === 'speech-only',
                  text: '',
                };
                result.rawResponses.push(raw);
                const context = buildVoiceContext(
                  history,
                  text,
                  'synthetic',
                  state.snapshot(),
                );
                for await (const chunk of services.executeStream(
                  {
                    ...context,
                    ...(compact
                      ? {
                          systemPrompt: buildCompactPersonaPrompt(
                            state.snapshot(),
                            raw.speechOnly,
                          ),
                        }
                      : raw.speechOnly
                        ? {
                            systemPrompt: buildSpeechOnlyPersonaPrompt(
                              state.snapshot(),
                            ),
                          }
                        : {}),
                    maxTokens: 1024,
                  },
                  signal,
                )) {
                  raw.text += chunk.content;
                  yield chunk.content;
                }
              }
              for await (const segment of streamPersonaSpeech(
                source,
                AbortSignal.timeout(60000),
                (expression, valid) => {
                  proposal = expression;
                  result.metadataValid = valid;
                },
                () => result.recoveries++,
              )) {
                result.firstSegmentMs ??= performance.now() - started;
                segments.push(segment);
              }
            } catch (error) {
              result.errorCode = error.code ?? error.name ?? 'EVALUATION_ERROR';
            }
            result.durationMs = performance.now() - started;
            result.text = segments.join(' ');
            result.screening = screenPersonaResponse(
              result.text,
              mode === 'speech-only' || result.metadataValid,
            );
            if (
              result.errorCode === 'QUOTA_EXCEEDED' &&
              retryAfter &&
              attempt < 2 &&
              !result.text
            ) {
              report.failedAttempts.push(result);
              await save();
              console.log(
                `${model} ${scenario.id}/${index + 1}: espera de cota ${retryAfter}s.`,
              );
              await new Promise((resolve) =>
                setTimeout(resolve, retryAfter * 1000),
              );
              continue;
            }
            report.results.push({
              ...result,
              expression: state.accept(proposal),
              observe: scenario.observe,
            });
            await save();
            console.log(
              `${model} ${scenario.id}/${index + 1}: ${result.errorCode ?? 'coletado'}; ${Math.round(result.durationMs)} ms; metadados ${result.metadataValid}.`,
            );
            if (result.errorCode) {
              blocked = result.errorCode !== 'PROVIDER_INVALID';
              process.exitCode = 1;
            }
            if (!blocked)
              history.push({
                userText: text,
                generatedText: result.text,
                responseStatus: result.errorCode ? 'failed' : 'completed',
                dataClass: 'synthetic',
              });
            break;
          }
          if (blocked) break;
        }
        if (blocked) break;
      }
      console.log(`Resultado local: ${file}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    database.client.close();
  }
}

main().catch((error) => {
  console.error(error.code ?? error.message ?? 'COMPARISON_FAILED');
  process.exitCode = 1;
});
