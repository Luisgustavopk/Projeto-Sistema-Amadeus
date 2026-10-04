import { expect, it, vi } from 'vitest';
import { createCallRuntime } from '../../src/application/voice/call-runtime.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';

function fixture(process: ReturnType<typeof createTurnProcessor>['process']) {
  const events: VoiceEvent[] = [];
  const release = vi.fn();
  const history: CallHistoryRepository = {
    startSession: async () => {},
    endSession: async () => {},
    beginTurn: async () => {},
    updateTurn: async () => {},
    recent: async () => [],
    addSegment: async () => {},
    setAudio: async () => {},
    acknowledge: async () => true,
  };
  const runtime = createCallRuntime({
    sessionId: 'session',
    conversationId: 'conversation',
    ownerId: 'owner',
    dataClass: 'synthetic',
    profile: null,
    history,
    processor: {
      process,
      transcribe: async () => 'Fala sintética',
      preview: async () => 'Fala sintética',
    },
    metrics: createVoiceMetrics(),
    gate: { beginExecution: () => release },
    sink: { send: (event) => events.push(event), audio: async () => {} },
  });

  return { runtime, events, release };
}

it('encerra o estado mesmo se playback.ended chegar antes de process resolver', async () => {
  let finish = () => {};

  const processing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const f = fixture(async (turn, sink) => {
    sink.send({
      type: 'reply.done',
      turnId: turn.turnId,
      responseId: turn.responseId,
    });
    f.runtime.playbackEnded(turn.responseId);
    await processing;
  });
  f.runtime.text(1, 'Texto sintético');
  await vi.waitFor(() =>
    expect(f.events.some((event) => event.type === 'reply.done')).toBe(true),
  );
  expect(
    f.events.some((event) => event.type === 'state' && event.state === 'idle'),
  ).toBe(false);
  finish();
  await vi.waitFor(() =>
    expect(f.events.at(-1)).toMatchObject({
      type: 'state',
      state: 'idle',
      turnId: 1,
    }),
  );
  expect(f.release).toHaveBeenCalledOnce();
  f.runtime.interrupt();
  expect(f.events.some((event) => event.type === 'interrupted')).toBe(false);
  await f.runtime.close('closed');
});

it('uma falha de geração não deixa um turno ativo sem execução', async () => {
  const f = fixture(async () => {
    throw new Error('test inference failure');
  });
  f.runtime.text(1, 'Texto sintético');
  await vi.waitFor(() =>
    expect(
      f.events.some(
        (event) => event.type === 'state' && event.state === 'error',
      ),
    ).toBe(true),
  );
  f.runtime.interrupt();
  expect(f.events.some((event) => event.type === 'interrupted')).toBe(false);
  expect(f.events.find((event) => event.type === 'error')).toMatchObject({
    turnId: 1,
    code: 'INTERNAL_ERROR',
  });
  expect(f.release).toHaveBeenCalledOnce();
  await f.runtime.close('closed');
});
