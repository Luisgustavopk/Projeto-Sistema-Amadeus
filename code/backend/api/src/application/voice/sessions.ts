import type { ProviderServices } from '../providers/index.ts';
import type { VoiceProfiles } from './profiles.ts';
import type { CallHistoryRepository } from '../../ports/call-history-repository.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';
import type { VoiceSink } from '../../ports/voice-session.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import { createTurnProcessor } from './turn-processor.ts';
import { createCallRuntime } from './call-runtime.ts';
import type { CallRuntime } from './call-runtime.ts';
import { VoiceNotReadyError } from '../../domain/errors/voice.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';
import type { VoiceMetrics } from './metrics.ts';

export function createVoiceSessions(dependencies: {
  providers: Pick<ProviderServices, 'execute' | 'executeStream'> &
    Partial<
      Pick<
        ProviderServices,
        'executeAudioStream' | 'closeSpeech' | 'speechVoiceId'
      >
    >;
  profiles: Pick<VoiceProfiles, 'active'>;
  history: CallHistoryRepository;
  gate: ExecutionGate;
  metrics: VoiceMetrics;
  ownerId: string;
  persistentState?: import('../persona/persistent-state.ts').PersistentPersonaState;
  references?: import('../../ports/persona-references.ts').PersonaReferenceRetriever;
  analysis?: Pick<import('../persona/analysis.ts').PersonaAnalysis, 'analyze'>;
  memory?: Pick<
    import('../memory/service.ts').MemoryService,
    'retrieve' | 'interruptBackground'
  >;
  persona?: {
    get: () => Promise<
      import('../persona/configuration.ts').PersonaConfiguration
    >;
  };
}) {
  const runtimes = new Set<CallRuntime>();
  const openings = new Set<Promise<CallRuntime>>();
  let openingQueue = Promise.resolve();
  let activeSession: {
    runtime: CallRuntime;
    onReplaced: () => Promise<void>;
  } | null = null;
  let shuttingDown = false;

  return {
    async shutdown() {
      shuttingDown = true;
      await Promise.allSettled([...openings]);
      await Promise.all(
        [...runtimes].map((runtime) => runtime.close('disconnected')),
      );
      runtimes.clear();
    },
    open(input: {
      sessionId: string;
      conversationId: string;
      dataClass: DataClass;
      sink: VoiceSink;
      signal?: AbortSignal;
      onReplaced?: () => Promise<void>;
      resume?: { previousSessionId: string; lastSeq: number };
    }) {
      if (shuttingDown) {
        return Promise.reject(
          new VoiceNotReadyError('O serviço está encerrando.'),
        );
      }

      // This service belongs to one owner. Serialize takeover as well as open
      // so two browser tabs cannot each become the active voice call.
      const opening = openingQueue.then(async () => {
        if (shuttingDown) {
          throw new VoiceNotReadyError('O serviço está encerrando.');
        }

        input.signal?.throwIfAborted();

        if (input.resume) {
          if (!dependencies.history.validateResume) {
            throw new VoiceInputError('Retomada indisponível.');
          }

          await dependencies.history.validateResume(
            input.resume.previousSessionId,
            input.conversationId,
            dependencies.ownerId,
          );
        }

        dependencies.memory?.interruptBackground();
        const profile = await dependencies.profiles.active();
        input.signal?.throwIfAborted();

        if (activeSession) {
          const previous = activeSession;
          activeSession = null;
          await Promise.all([
            previous.runtime.close('closed'),
            previous.onReplaced(),
          ]);
        }

        input.signal?.throwIfAborted();
        await dependencies.history.startSession({
          id: input.sessionId,
          conversationId: input.conversationId,
          ownerId: dependencies.ownerId,
          voiceProfileId: profile?.id ?? null,
          ...(input.resume ? { resume: input.resume } : {}),
        });

        const runtime = createCallRuntime({
          ...input,
          ownerId: dependencies.ownerId,
          profile,
          history: dependencies.history,
          processor: createTurnProcessor(
            dependencies.providers,
            dependencies.history,
            dependencies.metrics,
            dependencies.persona,
            dependencies.memory,
            dependencies.analysis,
            dependencies.persistentState,
            dependencies.references,
          ),
          gate: dependencies.gate,
          metrics: dependencies.metrics,
          resumed: Boolean(input.resume),
        });
        const close = runtime.close;
        let closing: Promise<void> | undefined;

        runtime.close = (state) => {
          closing ??= close(state).finally(() => {
            runtimes.delete(runtime);

            if (activeSession?.runtime === runtime) {
              activeSession = null;
            }
          });

          return closing;
        };

        runtimes.add(runtime);
        activeSession = {
          runtime,
          onReplaced: input.onReplaced ?? (async () => {}),
        };

        if (input.signal?.aborted) {
          await runtime.close('disconnected');
          input.signal.throwIfAborted();
        }

        return runtime;
      });
      openingQueue = opening.then(
        () => undefined,
        () => undefined,
      );
      openings.add(opening);
      void opening
        .finally(() => openings.delete(opening))
        .catch(() => undefined);

      return opening;
    },
  };
}

export type VoiceSessions = ReturnType<typeof createVoiceSessions>;
