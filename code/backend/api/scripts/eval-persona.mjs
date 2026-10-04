import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import {
  buildPersonaPrompt,
  buildSpeechOnlyPersonaPrompt,
} from '../src/application/persona/prompt.ts';
import {
  PersonaSuiteSchema,
  PersonaDialogueSuiteSchema,
  screenPersonaResponse,
} from '../src/domain/persona/evaluation.ts';
import {
  PERSONA_VERSION,
  NEUTRAL_EXPRESSION,
} from '../src/domain/persona/expression.ts';
import { buildVoiceContext } from '../src/application/voice/context.ts';
import { streamPersonaSpeech } from '../src/application/persona/speech-recovery.ts';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createProviderStreaming } from '../src/application/providers/streaming.ts';
import { ProviderSchema } from '../src/domain/providers/model.ts';
import { providerAttempts } from '../src/application/providers/fallback.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';

async function main() {
  const args = process.argv.slice(2);
  const dialogue = args.includes('--dialogue');
  const suite = (
    dialogue ? PersonaDialogueSuiteSchema : PersonaSuiteSchema
  ).parse(
    JSON.parse(
      await readFile(
        new URL(
          dialogue
            ? '../../evals/persona/dialogue-v1.json'
            : '../../evals/persona/scenarios-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const limit = Number(
    args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 30,
  );
  const from =
    args.find((arg) => arg.startsWith('--from='))?.slice('--from='.length) ??
    suite.cases[0].id;
  const startIndex = suite.cases.findIndex((item) => item.id === from);

  if (startIndex < 0) {
    throw new Error('O ID de --from precisa existir no conjunto escolhido.');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error('Use --limit=1 até --limit=30.');
  }

  if (!args.includes('--run')) {
    console.log(
      `${suite.cases.length} cenários validados. Persona ${PERSONA_VERSION}.`,
    );
    console.log(
      dialogue
        ? 'Para gerar respostas sintéticas: npm run eval:persona -- --dialogue --run --limit=4'
        : 'Para gerar respostas sintéticas: npm run eval:persona -- --run --limit=30',
    );
    console.log(
      'Escolha opcional: --model=<modelo já configurado>. Consome a cota normal; revisão humana continua necessária.',
    );
    return;
  }

  const config = loadConfig();
  const database = await openDatabase(config.DATABASE_URL);

  try {
    const stored = await new SqliteProviderConfigurationRepository(
      database.client,
    ).get(config.OWNER_ID);
    const model = args
      .find((arg) => arg.startsWith('--model='))
      ?.slice('--model='.length);
    const attempts = providerAttempts('llm', stored.llm);
    const local = args.includes('--local');
    const secrets = { ...process.env };
    if (local) {
      secrets.LOCAL_LLM_API_KEY = (
        await readFile(
          new URL('../../../../.cache/local-llm/access-token', import.meta.url),
          'utf8',
        )
      ).trim();
    }
    const selected = local
      ? ProviderSchema.parse({
          adapter: 'openai-local',
          model: 'amadeus-local',
          endpoint: 'http://127.0.0.1:8003/v1/chat/completions',
          apiKeyEnv: 'LOCAL_LLM_API_KEY',
          dataPolicy: 'local-approved',
          limits: stored.llm.limits,
        })
      : model
        ? attempts.find((item) => item.model === model)
        : attempts[0];

    if (!selected || selected.adapter === 'disabled') {
      throw new Error(
        'Modelo não encontrado entre os provedores configurados.',
      );
    }

    // Pin one configured candidate without changing production settings or silently substituting another model.
    const configuration = {
      get: async () => ({ ...stored, llm: selected }),
      save: async () => {
        throw new Error('Avaliação não altera configuração.');
      },
    };
    const services = createProviderStreaming(
      configuration,
      new SqliteProviderUsageRepository(database.client),
      config.OWNER_ID,
      createProviderFactory(secrets),
      new ActivityGate(1),
    );
    const report = {
      suiteVersion: suite.version,
      personaVersion: PERSONA_VERSION,
      promptSha256: createHash('sha256')
        .update(buildPersonaPrompt())
        .digest('hex'),
      createdAt: new Date().toISOString(),
      provider: selected.adapter,
      model: selected.model ?? null,
      dataClass: 'synthetic',
      humanReview: 'pending',
      voiceReview: null,
      results: [],
    };
    const directory = new URL('../data/persona-evals/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const file = new URL(`${Date.now()}-persona.json`, directory);

    for (const scenario of suite.cases.slice(startIndex, startIndex + limit)) {
      const started = performance.now();
      let expression = { ...NEUTRAL_EXPRESSION };
      let metadataValid = false;
      const spoken = [];
      let rawResponse = '';
      let recoveries = 0;
      let errorCode = null;
      let firstSegmentMs = null;
      const signal = AbortSignal.timeout(60000);

      try {
        async function* source(streamSignal, speechOnly) {
          for await (const value of services.executeStream(
            {
              ...buildVoiceContext(
                scenario.history,
                scenario.text,
                'synthetic',
              ),
              ...(speechOnly
                ? { systemPrompt: buildSpeechOnlyPersonaPrompt() }
                : {}),
              maxTokens: 512,
            },
            streamSignal,
          )) {
            rawResponse += value.content;
            yield value.content;
          }
        }

        for await (const segment of streamPersonaSpeech(
          source,
          signal,
          (value, valid) => {
            expression = value;
            metadataValid = valid;
          },
          () => {
            recoveries++;
          },
        )) {
          const text = segment;
          if (text) {
            firstSegmentMs ??= performance.now() - started;
            spoken.push(text);
          }
        }
      } catch (error) {
        errorCode = error.code ?? error.name ?? 'EVALUATION_ERROR';
      }

      const text = spoken.join(' ');
      report.results.push({
        ...scenario,
        inputText: scenario.text,
        text,
        rawResponse,
        recoveries,
        expression,
        metadataValid,
        firstSegmentMs,
        durationMs: performance.now() - started,
        errorCode,
        screening: screenPersonaResponse(text, metadataValid),
        scores: null,
        disqualifications: null,
      });
      await writeFile(file, JSON.stringify(report, null, 2) + '\n');
      console.log(
        `${scenario.id}: ${errorCode ?? 'resposta coletada'}; revisão humana pendente.`,
      );

      if (errorCode) {
        break;
      }
    }

    console.log(`Relatório: ${fileURLToPath(file)}`);
    if (report.results.some((result) => result.errorCode)) process.exitCode = 1;
  } finally {
    database.client.close();
  }
}

main().catch((error) => {
  console.error(error.code ?? error.message ?? 'Falha na avaliação.');
  process.exitCode = 1;
});
