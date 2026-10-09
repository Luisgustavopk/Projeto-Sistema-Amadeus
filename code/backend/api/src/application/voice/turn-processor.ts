import { randomUUID } from 'node:crypto';
import { buildPresenceDirection } from '../persona/presence-direction.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../persona/presence-reference.ts';
import type { PersonaReferenceRetriever } from '../../ports/persona-references.ts';
import { buildPersonaReferenceContext } from '../persona/corpus-context.ts';
import type { PersistentPersonaState } from '../persona/persistent-state.ts';
import type { ProviderServices } from '../providers/index.ts';
import type { CallHistoryRepository } from '../../ports/call-history-repository.ts';
import type { VoiceSink } from '../../ports/voice-session.ts';
import type { VoiceProfile, AudioClip } from '../../domain/voice/model.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import type { VoiceMetrics } from './metrics.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import { streamPersonaSpeech } from '../persona/speech-recovery.ts';
import { createInputRepair } from '../persona/input-repair.ts';
import { buildVoiceContext } from './context.ts';
import { buildHistoryContext } from './history-context.ts';
import {
  applyPersonaConfiguration,
  type PersonaConfiguration,
} from '../persona/configuration.ts';
import { measureVoiceAudio } from './audio-observations.ts';
import { providerWaitPhrase } from './provider-wait.ts';
import { providerWaitAudio } from './provider-wait-audio.ts';
import {
  buildVoicePersonaCore,
  voiceOutputFormat,
} from '../persona/voice-prompt.ts';
import { createConversationStyleObserver } from '../persona/conversation-style.ts';
import { createExpressionState } from '../../domain/persona/expression-policy.ts';
import { createSegmentExpressionObserver } from '../persona/segment-expression.ts';
import type { ExpressionClassifier } from '../persona/expression-classifier.ts';
import type { VoiceRuntimeOptions } from './runtime-configuration.ts';
import {
  memoryContent,
  memoryDirection as describeMemory,
} from '../memory/context.ts';
import {
  PERSONA_VERSION,
  NEUTRAL_EXPRESSION,
  describeDelivery,
} from '../../domain/persona/expression.ts';

export type VoiceTurn = {
  initiativeKind?: 'greeting' | 'initiative';
  sessionId: string;
  conversationId: string;
  ownerId: string;
  turnId: number;
  responseId: string;
  dataClass: DataClass;
  text?: string;
  audio?: AudioClip;
  audioObservations?: ReturnType<typeof measureVoiceAudio>;
  profile: VoiceProfile | null;
  signal: AbortSignal;
  speechEndedAt: number;
};

export function createTurnProcessor(
  providers: Pick<ProviderServices, 'execute' | 'executeStream'> &
    Partial<
      Pick<
        ProviderServices,
        'executeAudioStream' | 'closeSpeech' | 'speechVoiceId'
      >
    >,
  history: CallHistoryRepository,
  metrics: VoiceMetrics,
  persona?: { get: () => Promise<PersonaConfiguration> },
  memory?: Pick<
    import('../memory/service.ts').MemoryService,
    'retrieve' | 'interruptBackground'
  > &
    Partial<
      Pick<
        import('../memory/service.ts').MemoryService,
        'planAnswer' | 'verifyAnswer' | 'validateContext' | 'reviewMode'
      >
    >,
  analysis?: Pick<import('../persona/analysis.ts').PersonaAnalysis, 'analyze'>,
  persistentState?: Pick<PersistentPersonaState, 'snapshot' | 'observe'>,
  references?: PersonaReferenceRetriever,
  runtime?: {
    get: () => Promise<{ options: VoiceRuntimeOptions }>;
    classifier: ExpressionClassifier;
  },
) {
  const expressionState = createExpressionState();
  const inputRepair = createInputRepair();
  let previousObserver:
    ReturnType<typeof createSegmentExpressionObserver> | undefined;

  const executeProvider = async (
    role: Parameters<typeof providers.execute>[0],
    providerInput: Parameters<typeof providers.execute>[1],
    signal: Parameters<typeof providers.execute>[2],
    turnId: number,
    sink: VoiceSink,
  ) => {
    try {
      return await providers.execute(role, providerInput, signal);
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.code === 'QUOTA_EXCEEDED'
      ) {
        sink.send({ type: 'quota.warning', turnId, role });
      }

      throw error;
    }
  };

  async function transcribe(
    turn: Pick<VoiceTurn, 'turnId' | 'dataClass' | 'signal'>,
    audio: AudioClip,
    sink: VoiceSink,
    mode: 'final' | 'preview' = 'final',
  ) {
    const started = performance.now();

    try {
      const transcript = await executeProvider(
        'stt',
        {
          content: '',
          audio,
          dataClass: mode === 'preview' ? 'local-only' : turn.dataClass,
          maxTokens: 1000,
        },
        turn.signal,
        turn.turnId,
        sink,
      );
      turn.signal.throwIfAborted();
      const text = transcript.content.trim();

      if (!text || text.length > 4000) {
        throw new VoiceInputError(
          'A fala transcrita deve conter de 1 a 4000 caracteres.',
        );
      }

      if (mode === 'final') {
        sink.send({ type: 'transcript.final', turnId: turn.turnId, text });
      }

      return text;
    } catch (error) {
      if (
        mode === 'final' &&
        !turn.signal.aborted &&
        !(
          error instanceof ApplicationError &&
          error.code === 'NO_SPEECH_DETECTED'
        )
      ) {
        metrics.count('textFallbacks');
      }

      throw error;
    } finally {
      metrics.time(
        mode === 'final' ? 'stt' : 'sttPreview',
        performance.now() - started,
      );
    }
  }

  return {
    transcribe,
    preview(
      turn: Pick<VoiceTurn, 'turnId' | 'dataClass' | 'signal'>,
      audio: AudioClip,
      sink: VoiceSink,
    ) {
      return transcribe(turn, audio, sink, 'preview');
    },
    async process(turn: VoiceTurn, sink: VoiceSink) {
      const { signal, turnId, responseId } = turn;
      let deliveryQueue = Promise.resolve();
      const toneAbort = new AbortController();
      previousObserver?.dispose();

      try {
        memory?.interruptBackground();

        const emit = (event: Parameters<VoiceSink['send']>[0]) => {
          signal.throwIfAborted();
          sink.send(event);
        };

        let text = turn.text;

        if (turn.initiativeKind) {
          text = `[Evento da aplicação: ${turn.initiativeKind}; a pessoa não enviou uma mensagem.]`;
        }

        let firstAudio = true;

        if (turn.audio) {
          text = await transcribe(turn, turn.audio, sink);
        }

        if (!text?.trim() || text.length > 4000) {
          throw new VoiceInputError(
            'A fala transcrita deve conter de 1 a 4000 caracteres.',
          );
        }

        if (!turn.initiativeKind) {
          await history.updateTurn(responseId, { userText: text });
        }

        signal.throwIfAborted();
        const recent = await history.recent(
          turn.conversationId,
          turn.ownerId,
          12,
        );
        const context = buildVoiceContext(
          recent,
          text,
          turn.dataClass,
          expressionState.snapshot(),
          turn.audioObservations ??
            (turn.audio ? measureVoiceAudio(turn.audio, text) : undefined),
          true,
        );

        if (history.familiarity) {
          const familiarTurns = await history.familiarity(
            turn.ownerId,
            context.dataClass,
          );
          const familiarContext = buildVoiceContext(
            recent,
            text,
            turn.dataClass,
            expressionState.snapshot(),
            turn.audioObservations ??
              (turn.audio ? measureVoiceAudio(turn.audio, text) : undefined),
            true,
            familiarTurns,
          );
          context.content = familiarContext.content;
          context.conversationDirection = familiarContext.conversationDirection;
        }

        const personaConfiguration = await persona?.get();
        const runtimeOptions = (await runtime?.get())?.options;
        const parallelExpression =
          runtimeOptions?.expressionMode === 'parallel';
        const artisticState = await persistentState
          ?.snapshot(context.dataClass)
          .catch(() => {
            metrics.failure('PERSONA_STATE_UNAVAILABLE');

            return undefined;
          });
        const stateDirection = artisticState
          ? '\n<artistic_state>\n' +
            JSON.stringify({
              pleasure: artisticState.pleasure,
              arousal: artisticState.arousal,
              dominance: artisticState.dominance,
              energy: artisticState.energy,
            }) +
            '\nControles artísticos graduais. A persona canônica e o contexto atual prevalecem; energia baixa sugere concisão, não reclamação, indisponibilidade ou hostilidade. Não verbalize números ou nomes de variáveis.\n</artistic_state>'
          : '';
        const initiativeDirection = turn.initiativeKind
          ? '\n' + buildPresenceDirection(turn.initiativeKind, recent)
          : '';
        // Start the short analysis while memory retrieval/planning runs. No late
        // result can mutate a prompt after its generation has started.
        const analysisStarted = performance.now();
        let availableDirection = '';
        let needsClarification = false;
        const pendingDirection = (turn.initiativeKind ? undefined : analysis)
          ?.analyze(
            {
              text,
              recentConversation: JSON.stringify(
                buildHistoryContext(recent, 1800),
              ),
              dataClass: context.dataClass,
            },
            AbortSignal.any([signal, toneAbort.signal]),
            (needed) => {
              needsClarification = needed;
            },
          )
          .then((direction) => {
            availableDirection = direction;
            metrics.time(
              'personaAnalysis',
              performance.now() - analysisStarted,
            );

            return direction;
          });
        // Observe rejection immediately if the turn is cancelled during memory work.
        void pendingDirection?.catch(() => undefined);
        const retrievalText =
          turn.initiativeKind === 'greeting'
            ? 'Nome de tratamento e identidade da pessoa.'
            : turn.initiativeKind
              ? (recent.filter((item) => item.userText.trim()).at(-1)
                  ?.userText ?? text)
              : text;
        const memories = await memory?.retrieve(
          turn.conversationId,
          retrievalText,
          context.dataClass,
          buildHistoryContext(recent, 1800),
        );
        metrics.time('memoryRetrieve', performance.now() - analysisStarted);
        signal.throwIfAborted();

        // Personal memory has priority on the shared CPU models. Reference
        // lookup follows it with a bounded wait instead of blocking its queue.
        const referenceStarted = performance.now();
        const referenceQuery = turn.initiativeKind
          ? `[${turn.initiativeKind}] ${recent.filter((item) => item.userText.trim()).at(-1)?.userText ?? ''}`
          : `Pessoa agora: ${text.slice(0, 1200)}\nContexto anterior: ${recent
              .slice(-1)
              .map(
                (item) => `Pessoa: ${item.userText}\nAmadeus: ${item.sentText}`,
              )
              .join('\n')
              .slice(0, 500)}`;
        const selectedReferences = await references
          ?.retrieve(referenceQuery, signal, {
            focus: turn.initiativeKind
              ? (recent.filter((item) => item.userText.trim()).at(-1)
                  ?.userText ?? referenceQuery)
              : text,
          })
          .catch(() => undefined);
        signal.throwIfAborted();
        const referenceContext = buildPersonaReferenceContext(
          selectedReferences ?? { examples: [], lore: [] },
        );

        if (references) {
          metrics.time(
            'personaReferences',
            performance.now() - referenceStarted,
          );

          if (
            selectedReferences?.state === 'timeout' ||
            selectedReferences?.state === 'degraded' ||
            selectedReferences?.state === 'unindexed'
          ) {
            metrics.failure(
              'PERSONA_REFERENCES_' + selectedReferences.state.toUpperCase(),
            );
          }
        }

        context.history = [
          ...referenceContext.history,
          ...(context.history ?? []),
        ];

        const conversationContent = context.content;
        const memoryDirection = memory
          ? describeMemory(memories ?? '', false, true)
          : '';
        const recoveryMemoryDirection = memory
          ? describeMemory(memories ?? '', true)
          : '';
        const memoryContext = memories ? JSON.parse(memories) : { facts: [] };
        const factCount = memoryContext.facts?.length ?? 0;
        let withoutPersistentMemory = false;
        let regenerateWithoutMemory = false;
        const reviewMode = (await memory?.reviewMode?.()) ?? 'strict';
        let declaredUse:
          | import('../../domain/memory/response-use.ts').MemoryResponseUse
          | null = null;

        if (
          factCount &&
          memory?.validateContext &&
          !(await memory.validateContext(memories!, context.dataClass, signal))
        ) {
          withoutPersistentMemory = true;
          metrics.count('memoryContextRejected');
        }

        // Strict mode checks every reply with facts. Selective mode keeps local
        // validity checks and reviews recalled facts; self-reports are fallible.
        const needsMemoryReview = () =>
          Boolean(
            memory?.verifyAnswer &&
            factCount &&
            !withoutPersistentMemory &&
            (reviewMode === 'strict' ||
              !declaredUse ||
              declaredUse.use === 'recall' ||
              !memory.validateContext),
          );
        // Tone is opportunistic: it may use the retrieval window, never add a
        // foreground wait or mutate an already started generation.
        const contextualDirection = availableDirection;
        signal.throwIfAborted();

        context.systemPrompt =
          applyPersonaConfiguration(
            buildVoicePersonaCore(true, false),
            personaConfiguration,
          ) +
          referenceContext.system +
          memoryDirection +
          contextualDirection +
          context.conversationDirection +
          stateDirection +
          memoryContent('', memories ?? '') +
          PERSONA_PRESENCE_REFERENCE +
          initiativeDirection +
          (parallelExpression && !factCount
            ? '\nFORMATO: somente a fala em prosa, sem cabeçalhos, JSON, tags, gestos ou rubricas.'
            : voiceOutputFormat(factCount, parallelExpression));
        let proposal = expressionState.snapshot();
        let metadataValid = false;
        let expression = proposal;
        const started = performance.now();
        let firstLlmToken = false;

        const generated: string[] = [];
        let position = 0;
        let modelSpeechCount = 0;
        let waitAnnounced = false;
        let deliveryFailure: unknown;
        let latestExpressionPosition = -1;
        const observer =
          parallelExpression &&
          runtime &&
          context.dataClass !== 'local-only' &&
          (context.dataClass !== 'personal' ||
            runtimeOptions?.observerPersonalConsent)
            ? createSegmentExpressionObserver({
                classifier: runtime.classifier,
                signal,
                timeoutMs: runtimeOptions!.observerTimeoutMs,
                context: {
                  user: text,
                  history: (context.history ?? []).slice(-6),
                  dataClass: context.dataClass,
                  personalConsent: runtimeOptions!.observerPersonalConsent,
                },
                onFailure: (reason) => metrics.failure(reason),
                onDuration: (milliseconds) =>
                  metrics.time('expressionObserver', milliseconds),
                onResult: (target, value) => {
                  if (target.position >= latestExpressionPosition) {
                    latestExpressionPosition = target.position;
                    expression = expressionState.accept(value);
                  }

                  emit({
                    type: 'reply.expression',
                    turnId,
                    responseId,
                    segmentId: target.segmentId,
                    position: target.position,
                    personaVersion: PERSONA_VERSION,
                    ...value,
                    ...describeDelivery(value),
                    voiceProfileId: turn.profile?.id ?? null,
                    metadataValid: true,
                    deliveryApplied: false,
                    phase: 'update',
                  });
                },
              })
            : undefined;
        previousObserver = observer;

        const deliverSegmentNow = async (
          spokenText: string,
          waiting = false,
        ) => {
          signal.throwIfAborted();

          if (!spokenText) {
            return;
          }

          if (!waiting && modelSpeechCount === 0) {
            expression = expressionState.accept(proposal);
            metrics.time(
              needsClarification ? 'inputRepair' : 'llmFirstSpeechSegment',
              performance.now() - started,
            );
          }

          if (!waiting && parallelExpression) {
            expression = { ...NEUTRAL_EXPRESSION };
            metadataValid = false;
          }

          if (!waiting) {
            modelSpeechCount++;
          }

          generated.push(spokenText);
          await history.updateTurn(responseId, {
            generatedText: generated.join(' '),
          });
          signal.throwIfAborted();
          const segmentId = randomUUID();
          await history.addSegment({
            id: segmentId,
            responseId,
            position,
            text: spokenText,
          });
          emit({
            type: 'reply.text',
            turnId,
            responseId,
            segmentId,
            position,
            text: spokenText,
          });
          await history.markTextSent?.(segmentId);
          emit({
            type: 'reply.expression',
            turnId,
            responseId,
            segmentId,
            position,
            personaVersion: PERSONA_VERSION,
            ...(waiting ? NEUTRAL_EXPRESSION : expression),
            ...describeDelivery(waiting ? NEUTRAL_EXPRESSION : expression),
            voiceProfileId: turn.profile?.id ?? null,
            metadataValid: waiting ? false : metadataValid,
            deliveryApplied: false,
            phase: 'initial',
          });

          if (!waiting) {
            observer?.observe(spokenText, { segmentId, position });
          }

          if (!turn.profile) {
            metrics.count('textFallbacks');

            if (position === 0) {
              metrics.failure('VOICE_NOT_READY');
              emit({
                type: 'error',
                code: 'VOICE_NOT_READY',
                recoverable: true,
              });
            }

            position++;

            return;
          }

          let pcm: Buffer;
          let sampleRate: 16000 | 24000;
          const synthesisStart = performance.now();
          let measuredFirstTtsAudio = false;

          const recordFirstTtsAudio = () => {
            if (!waiting && !measuredFirstTtsAudio) {
              measuredFirstTtsAudio = true;
              metrics.time('ttsFirstAudio', performance.now() - synthesisStart);
            }
          };

          try {
            let bufferedOutput:
              import('../../ports/provider.ts').ProviderOutput | undefined;
            const cached = waiting
              ? providerWaitAudio(
                  spokenText,
                  turn.profile,
                  (await providers.speechVoiceId?.()) ?? null,
                )
              : null;

            if (waiting && !cached) {
              // Missing/stale presets stay text-only; never synthesize on failure.
              metrics.failure('WAIT_PRESET_NOT_READY');
              position++;

              return;
            }

            if (!waiting && providers.executeAudioStream && sink.audioStream) {
              const stream = providers.executeAudioStream(
                {
                  content: spokenText,
                  dataClass: context.dataClass,
                  maxTokens: 1,
                  speechContextId: responseId,
                  voice: {
                    id: turn.profile.id,
                    referenceFile: turn.profile.referenceFile,
                    referenceSha256: turn.profile.referenceSha256,
                  },
                },
                signal,
              );
              const iterator = stream[Symbol.asyncIterator]();

              try {
                const first = await iterator.next();

                if (first.done || !first.value.audio) {
                  throw new VoiceInputError('Síntese vazia.');
                }

                const rate = first.value.audio.sampleRate;
                recordFirstTtsAudio();

                if (!first.value.progressiveAudio) {
                  bufferedOutput = first.value;

                  if (!(await iterator.next()).done) {
                    throw new VoiceInputError(
                      'Síntese sem contrato incremental.',
                    );
                  }
                } else {
                  // Reserve the upper bound until completion; partial audio must not
                  // make the entire segment text eligible as confirmed history.
                  await history.setAudio(segmentId, rate * 90);
                  let samples = 0;

                  const chunks = async function* () {
                    let next: IteratorResult<
                      import('../../ports/provider.ts').ProviderOutput
                    > = first;

                    while (!next.done) {
                      signal.throwIfAborted();

                      if (
                        !next.value.audio ||
                        next.value.audio.sampleRate !== rate
                      ) {
                        throw new VoiceInputError(
                          'Taxa de áudio mudou durante o segmento.',
                        );
                      }

                      const chunk = Buffer.from(
                        next.value.audio.pcmBase64,
                        'base64',
                      );
                      samples += chunk.length / 2;
                      yield chunk;
                      next = await iterator.next();
                    }

                    await history.setAudio(segmentId, samples);
                  };

                  emit({ type: 'state', turnId, state: 'speaking' });

                  if (firstAudio) {
                    metrics.time(
                      'firstAudioAfterSpeechEnd',
                      performance.now() - turn.speechEndedAt,
                    );
                    firstAudio = false;
                  }

                  await sink.audioStream({
                    turnId,
                    responseId,
                    segmentId,
                    sampleRate: rate,
                    signal,
                    chunks: chunks(),
                  });
                  position++;

                  return;
                }
              } finally {
                await iterator.return?.();
              }
            }

            if (cached) {
              pcm = cached;
              sampleRate = 24000;
            } else {
              const synthesized =
                bufferedOutput ??
                (await executeProvider(
                  'tts',
                  {
                    content: spokenText,
                    dataClass: context.dataClass,
                    maxTokens: 1,
                    voice: {
                      id: turn.profile.id,
                      referenceFile: turn.profile.referenceFile,
                      referenceSha256: turn.profile.referenceSha256,
                    },
                  },
                  signal,
                  turnId,
                  sink,
                ));
              signal.throwIfAborted();

              if (!synthesized.audio) {
                throw new VoiceInputError('O TTS não retornou áudio PCM.');
              }

              sampleRate = synthesized.audio.sampleRate;

              if (
                ![16000, 24000].includes(sampleRate) ||
                synthesized.audio.channels !== 1
              ) {
                throw new VoiceInputError(
                  'Formato de áudio sintetizado inválido.',
                );
              }

              pcm = Buffer.from(synthesized.audio.pcmBase64, 'base64');

              if (
                !pcm.length ||
                pcm.length % 2 ||
                pcm.length > 3 * 1024 * 1024 ||
                pcm.toString('base64') !== synthesized.audio.pcmBase64
              ) {
                throw new VoiceInputError('Áudio sintetizado inválido.');
              }

              recordFirstTtsAudio();
            }
          } catch (error) {
            if (signal.aborted) {
              throw error;
            }

            if (
              error instanceof ApplicationError &&
              error.code === 'QUOTA_EXCEEDED'
            ) {
              emit({ type: 'quota.warning', turnId, role: 'tts' });
            }

            metrics.failure(
              error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
            );
            metrics.count('textFallbacks');

            if (sink.audioStream) {
              emit({ type: 'audio.abort', turnId, responseId, segmentId });
            }

            emit({
              type: 'error',
              code: 'TTS_UNAVAILABLE_TEXT_AVAILABLE',
              turnId,
              recoverable: true,
            });
            position++;

            return;
          } finally {
            metrics.time('tts', performance.now() - synthesisStart);
          }

          if (firstAudio && !waiting) {
            metrics.time(
              'firstAudioAfterSpeechEnd',
              performance.now() - turn.speechEndedAt,
            );
            firstAudio = false;
          }

          await history.setAudio(segmentId, pcm.length / 2);
          emit({ type: 'state', turnId, state: 'speaking' });
          const deliveryStart = performance.now();
          await sink.audio({
            turnId,
            responseId,
            segmentId,
            pcm,
            sampleRate,
            signal,
          });
          metrics.time('audioDelivery', performance.now() - deliveryStart);
          position++;
        };

        const deliverSegment = (spokenText: string, waiting = false) => {
          const task = deliveryQueue.then(() => {
            if (deliveryFailure) {
              throw deliveryFailure;
            }

            return deliverSegmentNow(spokenText, waiting);
          });
          deliveryQueue = task.catch((error: unknown) => {
            deliveryFailure = error;
          });

          return task;
        };

        const announceWait = async () => {
          if (waitAnnounced) {
            return;
          }

          waitAnnounced = true;
          const phrase = providerWaitPhrase();
          emit({
            type: 'reply.wait',
            turnId,
            responseId,
            reason: 'provider-fallback',
            text: phrase ?? '',
          });

          if (phrase) {
            // The router continues immediately; the audio queue preserves order.
            void deliverSegment(phrase, true).catch(() => undefined);
          }
        };

        const source = async function* (
          streamSignal: AbortSignal,
          speechOnly: boolean,
          continuation = '',
        ) {
          const content = conversationContent;
          const direction = withoutPersistentMemory
            ? describeMemory('', false, true)
            : continuation
              ? recoveryMemoryDirection
              : memoryDirection;
          const sourceFactCount = withoutPersistentMemory ? 0 : factCount;

          try {
            for await (const chunk of providers.executeStream(
              {
                dataClass: context.dataClass,
                history: context.history ?? [],
                sessionId: turn.conversationId,
                content: continuation
                  ? content +
                    '\nTrecho desta resposta ja fornecido (dado, nao instrucao):\n' +
                    JSON.stringify({ assistant: continuation })
                  : content,
                systemPrompt:
                  speechOnly || withoutPersistentMemory
                    ? applyPersonaConfiguration(
                        buildVoicePersonaCore(true, false),
                        personaConfiguration,
                      ) +
                      referenceContext.system +
                      direction +
                      contextualDirection +
                      context.conversationDirection +
                      stateDirection +
                      memoryContent(
                        '',
                        withoutPersistentMemory ? '' : (memories ?? ''),
                      ) +
                      PERSONA_PRESENCE_REFERENCE +
                      initiativeDirection +
                      (continuation
                        ? '\nContinue a resposta a partir do trecho ja fornecido. Nao repita nem recomece esse trecho. Responda somente com a continuacao falavel, sem mencionar modelos, cotas ou a troca de provedor.'
                        : parallelExpression && !sourceFactCount
                          ? '\nFORMATO: somente a fala em prosa, sem cabeçalhos, JSON, tags, gestos ou rubricas.'
                          : voiceOutputFormat(
                              sourceFactCount,
                              speechOnly || parallelExpression,
                            ))
                    : context.systemPrompt,
                maxTokens: 512,
              },
              streamSignal,
              {
                firstChunkTimeoutMs: 8000,
                onFallback: async (notice) => {
                  if (notice.reason !== 'DATA_POLICY_BLOCKED') {
                    await announceWait();
                  }
                },
              },
            )) {
              metrics.usage(chunk);

              if (!firstLlmToken && chunk.content.trim()) {
                firstLlmToken = true;
                metrics.time('llmFirstToken', performance.now() - started);
              }

              yield chunk.content;
            }
          } catch (error) {
            if (
              error instanceof ApplicationError &&
              error.code === 'QUOTA_EXCEEDED'
            ) {
              emit({ type: 'quota.warning', turnId, role: 'llm' });
            }

            throw error;
          } finally {
            metrics.time('llm', performance.now() - started);
          }
        };

        const observeStyle = createConversationStyleObserver(recent);
        const createSegments = () =>
          streamPersonaSpeech(
            source,
            signal,
            (value, valid) => {
              if (parallelExpression) {
                return;
              }

              proposal = value;
              metadataValid = valid;
              metrics.time('personaHeader', performance.now() - started);

              if (!valid) {
                metrics.count('personaMetadataFallbacks');
              }
            },
            () => metrics.count('personaRecoveries'),
            (speech, delivered) => {
              if (
                !delivered &&
                observeStyle(speech, delivered).repeatedOpening
              ) {
                metrics.count('personaRepeatedOpenings');
              }
            },
            announceWait,
            (use) => {
              declaredUse = use;

              if (
                use &&
                use.use !== 'none' &&
                use.facts.some(
                  (index) => index >= (withoutPersistentMemory ? 0 : factCount),
                )
              ) {
                throw new ProviderInvalidError(
                  'Resposta cita índice de memória ausente.',
                );
              }
            },
            {
              speechOnly:
                parallelExpression && (!factCount || withoutPersistentMemory),
              firstFlushMs: runtimeOptions?.firstFlushMs,
            },
          );
        emit({ type: 'reply.start', turnId, responseId });

        const provided: string[] = [];
        let length = 0;
        let reviewRequired = false;

        const deliverInputRepair = async () => {
          toneAbort.abort();
          metrics.count('inputClarifications');
          proposal = {
            intent: 'esclarecer',
            emotion: 'duvida',
            intensity: 0.2,
          };
          metadataValid = true;
          await deliverSegment(inputRepair());
        };

        // A decision already available needs no discarded author generation.
        // This does not wait for the optional classifier or bypass memory checks
        // on generated replies; the repair makes no assertion about memory.
        if (needsClarification) {
          await deliverInputRepair();
        }

        // With no retrieved facts there is no grounding request. When sources
        // are present, new recommendations/general knowledge remain permitted.
        for await (const segment of needsClarification
          ? []
          : createSegments()) {
          if (!modelSpeechCount) {
            // Do not wait for classification. A late answer cannot change a
            // started prompt; only a confident ambiguity found before speech
            // can replace an invented interpretation with a short repair.
            toneAbort.abort();

            if (needsClarification) {
              await deliverInputRepair();
              break;
            }
          }

          reviewRequired ||= needsMemoryReview();

          if (
            !reviewRequired &&
            factCount &&
            !withoutPersistentMemory &&
            memory?.validateContext
          ) {
            if (
              !(await memory.validateContext(
                memories!,
                context.dataClass,
                signal,
              ))
            ) {
              if (!modelSpeechCount) {
                withoutPersistentMemory = true;
                regenerateWithoutMemory = true;
                metrics.count('memoryContextRejected');
                break;
              }

              metrics.failure('MEMORY_CONTEXT_REVOKED');
              break;
            }

            metrics.count('memoryReviewSkipped');
          }

          if (reviewRequired) {
            length += segment.length;

            if (length > 6000) {
              throw new VoiceInputError(
                'Resposta de memória excede o limite de revisão.',
              );
            }

            const reviewStarted = performance.now();
            // Preserve previous speech for reference resolution. A null decision
            // means the optional semantic reviewer is unavailable, not rejection.
            const supported = await memory!.verifyAnswer!(
              memories ?? '',
              text,
              [...provided, segment].join(' '),
              context.dataClass,
              signal,
              buildHistoryContext(recent, 1800),
            );
            metrics.time('memoryReplyCheck', performance.now() - reviewStarted);

            if (supported === null) {
              metrics.count('memoryReviewUnavailable');
            }

            if (supported === false) {
              if (!modelSpeechCount) {
                // Never release the rejected draft or reuse its facts. Close
                // this stream, then try once with the current conversation only.
                // The model can answer a general request or acknowledge missing
                // recall without forcing every request into a memory question.
                withoutPersistentMemory = true;
                regenerateWithoutMemory = true;
                metrics.count('memoryReplyRecoveries');
                break;
              }

              metrics.failure('MEMORY_REPLY_UNVERIFIED');
              proposal = NEUTRAL_EXPRESSION;
              metadataValid = false;
              await deliverSegment(
                provided.length
                  ? 'Espera, não consegui confirmar essa última parte. Pode me esclarecer?'
                  : 'Não consegui confirmar esse detalhe nas minhas lembranças agora. Pode me lembrar?',
              );
              break;
            }

            provided.push(segment);
          }

          await deliverSegment(segment);
        }

        if (regenerateWithoutMemory) {
          proposal = NEUTRAL_EXPRESSION;
          metadataValid = false;

          for await (const segment of createSegments()) {
            await deliverSegment(segment);
          }
        }

        if (!modelSpeechCount) {
          throw new VoiceInputError('O modelo não retornou texto falável.');
        }

        await history.updateTurn(responseId, { status: 'completed' });
        signal.throwIfAborted();

        if (!turn.initiativeKind && persistentState) {
          await persistentState
            .observe(context.dataClass, responseId, expression)
            .catch(() => {
              signal.throwIfAborted();
              metrics.failure('PERSONA_STATE_UNAVAILABLE');
            });
        }

        metrics.count('completed');
        emit({ type: 'reply.done', turnId, responseId });
      } finally {
        toneAbort.abort();
        await deliveryQueue;
        await providers.closeSpeech?.(responseId).catch(() => undefined);
      }
    },
  };
}
