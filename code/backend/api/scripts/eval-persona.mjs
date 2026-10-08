import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
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
import { buildHistoryContext } from '../src/application/voice/history-context.ts';
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
import { createConversationStyleObserver } from '../src/application/persona/conversation-style.ts';
import { createExpressionState } from '../src/domain/persona/expression-policy.ts';

async function main() {
  const args = process.argv.slice(2);
  const interval = Number(
    args.find((arg) => arg.startsWith('--interval-ms='))?.split('=')[1] ?? 0,
  );
  if (!Number.isInteger(interval) || interval < 0 || interval > 60000)
    throw new Error('Intervalo permitido: 0 a 60000 ms.');
  const dialogue = args.includes('--dialogue');
  const skill = args.includes('--skill');
  const continuity = args.includes('--continuity');
  const refinement = args.includes('--refinement');
  if ([dialogue, skill, continuity, refinement].filter(Boolean).length > 1)
    throw new Error('Escolha apenas um conjunto de avaliação por execução.');
  const suite = (
    dialogue || skill || continuity || refinement
      ? PersonaDialogueSuiteSchema
      : PersonaSuiteSchema
  ).parse(
    JSON.parse(
      await readFile(
        new URL(
          refinement
            ? '../../evals/persona/refinement-v1.json'
            : continuity
              ? '../../evals/persona/continuity-v1.json'
              : skill
                ? '../../evals/persona/skill-v1.json'
                : dialogue
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
  if (continuity && startIndex !== 0)
    throw new Error(
      'Continuidade começa em D01 para preservar as respostas realmente geradas.',
    );

  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error('Use --limit=1 até --limit=30.');
  }

  if (!args.includes('--run')) {
    console.log(
      `${suite.cases.length} cenários validados. Persona ${PERSONA_VERSION}.`,
    );
    console.log(
      refinement
        ? 'Para testar ajustes e transferência: npm run eval:persona -- --refinement --run --limit=12'
        : continuity
          ? 'Para gerar um diálogo encadeado: npm run eval:persona -- --continuity --run --limit=12'
          : skill
            ? 'Para gerar respostas sintéticas: npm run eval:persona -- --skill --run --limit=12'
            : dialogue
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
      evaluationMode: continuity
        ? 'generated-continuous-dialogue'
        : 'independent-scenarios',
      historyConfirmation: continuity
        ? 'synthetic-text-assumed-complete; no audio played'
        : 'fixture',
      humanReview: 'pending',
      voiceReview: null,
      results: [],
    };
    const directory = new URL('../data/persona-evals/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const file = new URL(`${Date.now()}-persona.json`, directory);

    const generatedHistory = [];
    const expressionState = createExpressionState();
    const resumeName = args
      .find((arg) => arg.startsWith('--resume='))
      ?.slice('--resume='.length);
    let resumedTurns = 0;
    if (resumeName) {
      if (!continuity || !/^\d+-persona\.json$/.test(resumeName))
        throw new Error(
          'Use --resume=<relatório local> apenas em continuidade.',
        );
      const prior = JSON.parse(
        await readFile(new URL(resumeName, directory), 'utf8'),
      );
      if (
        prior.promptSha256 !== report.promptSha256 ||
        prior.personaVersion !== report.personaVersion ||
        prior.suiteVersion !== report.suiteVersion ||
        prior.evaluationMode !== 'generated-continuous-dialogue'
      )
        throw new Error('Retomada exige a mesma persona, prompt e conjunto.');
      const completed = prior.results.filter(
        (row) => !row.errorCode && row.text,
      );
      for (const row of completed) {
        if (row.id !== suite.cases[resumedTurns]?.id)
          throw new Error('Retomada exige um prefixo contínuo sem lacunas.');
        generatedHistory.push({
          userText: row.inputText,
          generatedText: row.text,
          dataClass: 'synthetic',
          responseStatus: 'completed',
          partiallyPlayed: false,
        });
        expressionState.accept(row.expression);
        resumedTurns++;
      }
      report.resumedFrom = resumeName;
      report.previousProvider = prior.provider;
      report.previousModel = prior.model;
      report.results = completed.map((row, index) => ({
        ...row,
        provider:
          row.provider ??
          (index < (prior.resumedTurns ?? 0)
            ? prior.previousProvider
            : prior.provider),
        model:
          row.model ??
          (index < (prior.resumedTurns ?? 0)
            ? prior.previousModel
            : prior.model),
      }));
      report.resumedTurns = resumedTurns;
    }
    for (const definition of suite.cases.slice(
      startIndex + resumedTurns,
      startIndex + resumedTurns + limit,
    )) {
      const scenario = continuity
        ? { ...definition, history: [...generatedHistory] }
        : definition;
      const previousExpression = continuity
        ? expressionState.snapshot()
        : NEUTRAL_EXPRESSION;
      if (report.results.length && interval) await delay(interval);
      const started = performance.now();
      let expression = { ...NEUTRAL_EXPRESSION };
      let metadataValid = false;
      const spoken = [];
      let rawResponse = '';
      let recoveries = 0;
      let errorCode = null;
      let retryAfterMs = null;
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
                previousExpression,
              ),
              ...(speechOnly
                ? {
                    systemPrompt:
                      buildSpeechOnlyPersonaPrompt(previousExpression),
                  }
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
          createConversationStyleObserver(scenario.history),
        )) {
          const text = segment;
          if (text) {
            firstSegmentMs ??= performance.now() - started;
            spoken.push(text);
          }
        }
      } catch (error) {
        errorCode = error.code ?? error.name ?? 'EVALUATION_ERROR';
        retryAfterMs = Number.isFinite(error.retryAfterMs)
          ? error.retryAfterMs
          : null;
      }

      const text = spoken.join(' ');
      const appliedExpression = continuity
        ? expressionState.accept(expression)
        : expression;
      report.results.push({
        ...scenario,
        provider: selected.adapter,
        model: selected.model ?? null,
        inputText: scenario.text,
        sentHistory: buildHistoryContext(scenario.history, 3000),
        text,
        rawResponse,
        recoveries,
        expression,
        appliedExpression,
        metadataValid,
        firstSegmentMs,
        durationMs: performance.now() - started,
        errorCode,
        retryAfterMs,
        screening: screenPersonaResponse(text, metadataValid, scenario.text),
        scores: null,
        disqualifications: null,
      });
      await writeFile(file, JSON.stringify(report, null, 2) + '\n');
      if (continuity && !errorCode)
        generatedHistory.push({
          userText: scenario.text,
          generatedText: text,
          dataClass: 'synthetic',
          responseStatus: 'completed',
          partiallyPlayed: false,
        });
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
