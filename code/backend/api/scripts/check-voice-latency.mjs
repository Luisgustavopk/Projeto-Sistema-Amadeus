import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createProviderServices } from '../src/application/providers/index.ts';
import { createMemoryProvider } from '../src/application/memory/provider.ts';
import { verifyMemorySpeech } from '../src/application/memory/review.ts';
import { createPersonaAnalysis } from '../src/application/persona/analysis.ts';
import { createJevClient } from '../src/adapters/providers/jev.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { ApplicationError } from '../src/domain/errors/application-error.ts';

async function main() {
  const limitArg = process.argv[2];
  if (
    process.argv.length > 3 ||
    (limitArg && !/^--(?:limit|case)=[1-8]$/.test(limitArg))
  )
    throw new Error(
      'Ensaio fixo: use --limit=1 a 8 ou --case=1 a 8, incluindo TTS.',
    );
  const limit = limitArg?.startsWith('--limit=')
    ? Number(limitArg.slice(8))
    : 8;
  const onlyCase = limitArg?.startsWith('--case=')
    ? Number(limitArg.slice(7))
    : null;
  const client = createClient({
    url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
  });
  try {
    await client.execute('PRAGMA busy_timeout = 3000');
    const ownerId = process.env.OWNER_ID ?? 'primary';
    const configuration = new SqliteProviderConfigurationRepository(client);
    const usage = new SqliteProviderUsageRepository(client);
    const revisions = createRevisionRepository(client);
    const originalFactory = createProviderFactory(process.env);
    const providerFailures = [];
    const factory = (role, config) => {
      const provider = originalFactory(role, config);
      if (role !== 'tts') return provider;
      const record = (error) =>
        providerFailures.push({
          adapter: config.adapter,
          model: config.model,
          code: error instanceof ApplicationError ? error.code : error.name,
          message:
            error instanceof ApplicationError
              ? error.message
              : 'Erro não tipado no adaptador.',
        });
      return {
        ...provider,
        async execute(input, signal) {
          try {
            return await provider.execute(input, signal);
          } catch (error) {
            record(error);
            throw error;
          }
        },
        ...(provider.streamAudio
          ? {
              async *streamAudio(input, signal) {
                try {
                  yield* provider.streamAudio(input, signal);
                } catch (error) {
                  record(error);
                  throw error;
                }
              },
            }
          : {}),
      };
    };
    const gate = {
      beginConfiguration: () => () => {},
      beginExecution: () => () => {},
    };
    const providers = createProviderServices({
      configuration,
      usage,
      ownerId,
      factory,
      gate,
    });
    const memoryProvider = createMemoryProvider({
      revisions,
      conversationConfiguration: configuration,
      usage,
      ownerId,
      factory,
      gate,
    });
    const reviewDecisions = [];
    const analysisDecisions = [];
    const jev = createJevClient(process.env);
    const analysis = createPersonaAnalysis({
      repository: revisions,
      usage,
      ownerId,
      client: {
        ...jev,
        async decide(input, signal) {
          const result = await jev.decide(input, signal);
          analysisDecisions.push({
            tone: result.tone,
            clarity: result.clarity,
          });
          return result;
        },
        async reviewMemory(request, signal) {
          const result = await jev.reviewMemory(request, signal);
          reviewDecisions.push({
            verdict: result.verdict,
            confidence: result.confidence,
          });
          return result;
        },
      },
    });
    const fact = {
      id: randomUUID(),
      version: 1,
      text: 'O usuário fictício prefere café sem açúcar.',
      dataClass: 'synthetic',
      relation: {
        subject: 'usuário fictício',
        predicate: 'prefere',
        object: 'café sem açúcar',
      },
      kind: 'fact',
      expiresAt: null,
    };
    const facts = JSON.stringify({ facts: [fact], summaries: [] });
    const cases = [
      {
        id: 'saudacao-vazia',
        text: 'E aí, Amadeus, como é que tá?',
        memories: '',
      },
      {
        id: 'saudacao-com-fato-irrelevante',
        text: 'Hi Amadeus, how are you doing?',
        memories: facts,
      },
      {
        id: 'conversa-geral',
        text: 'Hoje quero só conversar sobre RPG. Acho divertido improvisar com os amigos.',
        memories: facts,
      },
      {
        id: 'lembranca-real',
        text: 'Como eu prefiro tomar meu café?',
        memories: facts,
        recall: true,
      },
      {
        id: 'indicacao-nova-com-preferencias',
        text: 'Você tem um jogo interessante para me indicar?',
        memories: JSON.stringify({
          facts: [
            {
              ...fact,
              text: 'O usuário fictício gosta de RPG, terror e narrativas com escolhas.',
              relation: {
                subject: 'usuário fictício',
                predicate: 'gosta',
                object: 'RPG, terror e narrativas com escolhas',
              },
            },
          ],
          summaries: [],
        }),
        recall: true,
      },
      {
        id: 'apelido-e-saudacao',
        text: 'Eae Christine, tudo bem?',
        memories: '',
      },
      {
        id: 'fragmento-ambiguo',
        text: 'Achas de petróleo',
        memories: facts,
      },
      {
        id: 'continuidade-indicacao',
        text: 'Esse é mais para jogar sozinho ou com os amigos?',
        memories: '',
        history: [
          {
            userText: 'Me indica um RPG para este fim de semana.',
            generatedText:
              'Divinity: Original Sin 2 é uma opção: permite experimentar bastante e tem decisões interessantes.',
            dataClass: 'synthetic',
            responseStatus: 'completed',
          },
        ],
      },
    ];
    const records = [];
    for (const scenario of onlyCase
      ? [cases[onlyCase - 1]]
      : cases.slice(0, limit)) {
      const decisionOffset = reviewDecisions.length;
      const analysisOffset = analysisDecisions.length;
      const rawGenerations = [];
      const audioErrors = [];
      const observed = {
        ...providers,
        async *executeAudioStream(input, signal) {
          try {
            yield* providers.executeAudioStream(input, signal);
          } catch (error) {
            audioErrors.push({
              code: error.code ?? error.name,
              message: error.message,
            });
            throw error;
          }
        },
        async *executeStream(input, signal, options) {
          const raw = {
            content: '',
            promptChars: input.systemPrompt?.length ?? 0,
            error: null,
          };
          rawGenerations.push(raw);
          try {
            for await (const chunk of providers.executeStream(
              input,
              signal,
              options,
            )) {
              raw.content += chunk.content;
              yield chunk;
            }
          } catch (error) {
            raw.error = error.code ?? error.name;
            throw error;
          }
        },
      };
      const metrics = createVoiceMetrics();
      const events = [];
      let firstAudioMs = null;
      let pcmBytes = 0;
      let reviewCalls = 0;
      let memoriesSupplied = '';
      const providerFailureOffset = providerFailures.length;
      let reviewError = null;
      const history = {
        startSession: async () => {},
        endSession: async () => {},
        beginTurn: async () => {},
        updateTurn: async () => {},
        recent: async () => scenario.history ?? [],
        addSegment: async () => {},
        setAudio: async () => {},
        acknowledge: async () => true,
      };
      const processor = createTurnProcessor(
        observed,
        history,
        metrics,
        undefined,
        {
          retrieve: async () => {
            memoriesSupplied = scenario.memories;

            return memoriesSupplied;
          },
          interruptBackground: () => {},
          verifyAnswer: async (...args) => {
            reviewCalls++;
            try {
              const [memories, question, reply, dataClass, signal, recent] =
                args;
              const fast = (await analysis.canReviewMemory(dataClass))
                ? await analysis.reviewMemory(
                    {
                      memories,
                      question,
                      reply,
                      dataClass,
                      recentConversation: JSON.stringify(recent ?? []),
                    },
                    signal,
                  )
                : null;
              return (
                fast ??
                ((await memoryProvider.canReviewMemory(dataClass))
                  ? await verifyMemorySpeech(memoryProvider, ...args)
                  : null)
              );
            } catch (error) {
              reviewError = error.code ?? error.name;
              return null;
            }
          },
        },
        analysis,
      );
      const started = performance.now();
      try {
        await processor.process(
          {
            sessionId: randomUUID(),
            conversationId: randomUUID(),
            ownerId,
            turnId: 1,
            responseId: randomUUID(),
            dataClass: 'synthetic',
            text: scenario.text,
            profile: {
              id: randomUUID(),
              name: 'ensaio sintético',
              referenceFile: 'synthetic-unused-by-cartesia.wav',
              referenceSha256: 'a'.repeat(64),
              createdAt: new Date().toISOString(),
            },
            signal: AbortSignal.timeout(60000),
            speechEndedAt: started,
          },
          {
            send: (event) => events.push(event),
            audio: async ({ pcm }) => {
              firstAudioMs ??= Math.round(performance.now() - started);
              pcmBytes += pcm.length;
            },
            audioStream: async ({ chunks }) => {
              let samples = 0;
              for await (const pcm of chunks) {
                firstAudioMs ??= Math.round(performance.now() - started);
                pcmBytes += pcm.length;
                samples += pcm.length / 2;
              }
              return samples;
            },
          },
        );
        const snapshot = metrics.snapshot();
        records.push({
          scenario: scenario.id,
          userText: scenario.text,
          firstAudioMs,
          elapsedMs: Math.round(performance.now() - started),
          pcmBytes,
          audioErrors,
          providerFailures: providerFailures.slice(providerFailureOffset),
          reviewCalls,
          reviewDecisions: reviewDecisions.slice(decisionOffset),
          reviewError,
          inputClarifications: snapshot.inputClarifications,
          memoryReplyRecoveries: snapshot.memoryReplyRecoveries,
          memoryContextSupplied: Boolean(memoriesSupplied),
          analysisDecisions: analysisDecisions.slice(analysisOffset),
          spoken: events
            .filter((e) => e.type === 'reply.text')
            .map((e) => e.text)
            .join(' '),
          expressionValid: events
            .filter((e) => e.type === 'reply.expression')
            .every((e) => e.metadataValid),
          failures: snapshot.failureReasons,
          stages: snapshot.stages,
          rawGenerations,
          passed:
            firstAudioMs !== null &&
            !audioErrors.length &&
            !snapshot.failureReasons.MEMORY_REPLY_UNVERIFIED &&
            (memoriesSupplied &&
            JSON.parse(memoriesSupplied).facts.length &&
            !snapshot.inputClarifications
              ? reviewCalls >= 1
              : reviewCalls === 0),
        });
      } catch (error) {
        records.push({
          scenario: scenario.id,
          error: error.code ?? error.name,
          errorMessage: error.message,
          rawGenerations,
          passed: false,
        });
      }
      console.log(
        JSON.stringify(records.at(-1), (key, value) =>
          key === 'rawGenerations' ? undefined : value,
        ),
      );
    }
    const directory = new URL('../data/refinement/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const filename =
      'voice-latency-' +
      new Date().toISOString().replaceAll(':', '-') +
      '.json';
    await writeFile(
      new URL(filename, directory),
      JSON.stringify(
        {
          records,
          limitations:
            'Até oito casos sintéticos: configuração e orçamentos reais, contexto de memória e histórico fixos, sem STT, busca local, histórico persistente ou reprodução no navegador. passed verifica funcionamento, não fidelidade artística; revisar spoken separadamente.',
        },
        null,
        2,
      ) + '\n',
    );
    console.log('Relatório local: data/refinement/' + filename);
    if (records.some((record) => !record.passed)) process.exitCode = 1;
  } finally {
    client.close();
  }
}
main().catch((error) => {
  console.error(error.code ?? error.name);
  process.exitCode = 1;
});
