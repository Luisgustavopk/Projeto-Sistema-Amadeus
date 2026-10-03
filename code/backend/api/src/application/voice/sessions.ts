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
import type { VoiceMetrics } from './metrics.ts';

export function createVoiceSessions(dependencies: {
  providers: ProviderServices;
  profiles: VoiceProfiles;
  history: CallHistoryRepository;
  gate: ExecutionGate;
  metrics: VoiceMetrics;
  ownerId: string;
}) {
  const processor = createTurnProcessor(
    dependencies.providers,
    dependencies.history,
    dependencies.metrics,
  );

  const runtimes = new Set<CallRuntime>();
  const openings = new Set<Promise<CallRuntime>>();
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
    }) {
      if (shuttingDown) {
        return Promise.reject(
          new VoiceNotReadyError('O serviço está encerrando.'),
        );
      }

      const opening = (async () => {
        const profile = await dependencies.profiles.active();
        await dependencies.history.startSession({
          id: input.sessionId,
          conversationId: input.conversationId,
          ownerId: dependencies.ownerId,
          voiceProfileId: profile?.id ?? null,
        });

        const runtime = createCallRuntime({
          ...input,
          ownerId: dependencies.ownerId,
          profile,
          history: dependencies.history,
          processor,
          gate: dependencies.gate,
          metrics: dependencies.metrics,
        });
        const close = runtime.close;
        let closing: Promise<void> | undefined;

        runtime.close = (state) => {
          closing ??= close(state).finally(() => runtimes.delete(runtime));

          return closing;
        };

        runtimes.add(runtime);

        return runtime;
      })();
      openings.add(opening);
      void opening
        .finally(() => openings.delete(opening))
        .catch(() => undefined);

      return opening;
    },
  };
}

export type VoiceSessions = ReturnType<typeof createVoiceSessions>;
