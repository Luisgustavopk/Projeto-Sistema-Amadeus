import { afterEach, expect, it, vi } from 'vitest';
import { createCallRuntime } from '../../src/application/voice/call-runtime.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { createTurnProcessor } from '../../src/application/voice/turn-processor.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';
import type { VoiceEvent } from '../../src/ports/voice-session.ts';
import { ProviderBusyError } from '../../src/domain/errors/providers.ts';

afterEach(() => vi.useRealTimers());

it('recusa a iniciativa sem fechar a chamada durante atualização de configuração', async () => {
  vi.useFakeTimers();
  const process = vi.fn(async () => {});
  const f = fixture(process, {
    beginExecution() {
      throw new ProviderBusyError('Busy');
    },
  });
  f.runtime.presenceUpdate({ enabled: true, available: true });
  await vi.advanceTimersByTimeAsync(1500);
  const offer = f.events.find((event) => event.type === 'presence.offer');

  if (!offer || offer.type !== 'presence.offer') {
    throw new Error('Missing offer');
  }

  expect(() => f.runtime.presenceAccept(offer.offerId, 1)).not.toThrow();
  expect(f.events).toContainEqual({
    type: 'presence.cancelled',
    offerId: offer.offerId,
    turnId: 1,
  });
  expect(process).not.toHaveBeenCalled();
  await f.runtime.close('closed');
});

it('uma nova captura cancela a iniciativa imediatamente antes de qualquer transcrição', async () => {
  vi.useFakeTimers();
  let aborted = false;
  const f = fixture(async (turn) => {
    await new Promise<void>((resolve) =>
      turn.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          resolve();
        },
        { once: true },
      ),
    );
    turn.signal.throwIfAborted();
  });
  f.runtime.presenceUpdate({ enabled: true, available: true });
  await vi.advanceTimersByTimeAsync(1500);
  const offer = f.events.find((event) => event.type === 'presence.offer');

  if (!offer || offer.type !== 'presence.offer') {
    throw new Error('Missing offer');
  }

  f.runtime.presenceAccept(offer.offerId, 1);
  await vi.advanceTimersByTimeAsync(0);
  f.runtime.speechStart(2);
  expect(aborted).toBe(true);
  expect(f.events).toContainEqual(
    expect.objectContaining({ type: 'interrupted', turnId: 1 }),
  );
  expect(f.events.some((event) => event.type.startsWith('transcript.'))).toBe(
    false,
  );
  await f.runtime.close('closed');
  expect(f.release).toHaveBeenCalledOnce();
});

function fixture(
  process: ReturnType<typeof createTurnProcessor>['process'],
  gate?: Parameters<typeof createCallRuntime>[0]['gate'],
) {
  const events: VoiceEvent[] = [];
  const release = vi.fn();
  const history: CallHistoryRepository = {
    startSession: async () => {},
    endSession: async () => {},
    beginTurn: vi.fn(async () => {}),
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
    gate: gate ?? { beginExecution: () => release },
    sink: { send: (event) => events.push(event), audio: async () => {} },
  });

  return { runtime, events, release, history };
}

it('gera saudação e iniciativa pela negociação real e aguarda término da entrega antes de contar silêncio', async () => {
  vi.useFakeTimers();
  const turns: Parameters<
    ReturnType<typeof createTurnProcessor>['process']
  >[0][] = [];
  const f = fixture(async (turn, sink) => {
    turns.push(turn);
    sink.send({
      type: 'reply.done',
      turnId: turn.turnId,
      responseId: turn.responseId,
    });
  });
  f.runtime.presenceUpdate({ enabled: true, available: true });
  await vi.advanceTimersByTimeAsync(1500);
  const first = f.events.find((event) => event.type === 'presence.offer');

  if (!first || first.type !== 'presence.offer') {
    throw new Error('Missing greeting');
  }

  f.runtime.presenceAccept(first.offerId, 1);
  await vi.advanceTimersByTimeAsync(0);
  expect(turns[0]?.initiativeKind).toBe('greeting');
  f.runtime.playbackEnded(turns[0]!.responseId);
  f.runtime.text(2, 'Estou desenhando um puzzle de investigação.');
  await vi.advanceTimersByTimeAsync(0);
  // No voice is generated in this test; the client still acknowledges delivery.
  await vi.advanceTimersByTimeAsync(300000);
  expect(
    f.events.filter((event) => event.type === 'presence.offer'),
  ).toHaveLength(1);
  f.runtime.playbackEnded(turns[1]!.responseId);
  await vi.advanceTimersByTimeAsync(89999);
  expect(
    f.events.filter((event) => event.type === 'presence.offer'),
  ).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  const second = f.events
    .filter((event) => event.type === 'presence.offer')
    .at(-1);

  if (!second || second.type !== 'presence.offer') {
    throw new Error('Missing initiative');
  }

  expect(second.kind).toBe('initiative');
  f.runtime.presenceAccept(second.offerId, 3);
  await vi.advanceTimersByTimeAsync(0);
  expect(turns[2]?.initiativeKind).toBe('initiative');
  expect(f.history.beginTurn).toHaveBeenLastCalledWith(
    expect.objectContaining({ initiativeKind: 'initiative', clientTurnId: 3 }),
  );
  f.runtime.playbackEnded(turns[2]!.responseId);
  await f.runtime.close('closed');
});

it('uma falha suspende iniciativa; reativar presença permite nova oferta após fala válida', async () => {
  vi.useFakeTimers();
  let fail = true;
  const turns: Parameters<
    ReturnType<typeof createTurnProcessor>['process']
  >[0][] = [];
  const f = fixture(async (turn) => {
    if (fail) {
      throw new Error('synthetic provider failure');
    }

    turns.push(turn);
  });
  f.runtime.presenceUpdate({ enabled: true, available: true });
  f.runtime.text(1, 'Oi.');
  await vi.advanceTimersByTimeAsync(0);
  expect(f.events.some((event) => event.type === 'error')).toBe(true);
  await vi.advanceTimersByTimeAsync(600000);
  expect(f.events.some((event) => event.type === 'presence.offer')).toBe(false);
  fail = false;
  f.runtime.presenceUpdate({ enabled: true, available: true });
  f.runtime.text(2, 'Vamos falar de memória.');
  await vi.advanceTimersByTimeAsync(0);
  f.runtime.playbackEnded(turns[0]!.responseId);
  await vi.advanceTimersByTimeAsync(90000);
  expect(
    f.events.some(
      (event) => event.type === 'presence.offer' && event.kind === 'initiative',
    ),
  ).toBe(true);
  await f.runtime.close('closed');
});

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

it('aguarda cancelamento e persistência anteriores antes de gerar a nova resposta', async () => {
  let releasePrevious = () => {};

  const persisted = new Promise<void>((resolve) => {
    releasePrevious = resolve;
  });
  const order: string[] = [];
  const f = fixture(async (turn) => {
    order.push(`start-${turn.turnId}`);

    if (turn.turnId === 1) {
      await new Promise<void>((resolve) =>
        turn.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      await persisted;
      order.push('previous-persisted');
      turn.signal.throwIfAborted();
    }
  });
  f.runtime.text(1, 'Primeiro');
  await vi.waitFor(() => expect(order).toContain('start-1'));
  f.runtime.text(2, 'Segundo');
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(order).toEqual(['start-1']);
  releasePrevious();
  await vi.waitFor(() =>
    expect(order).toEqual(['start-1', 'previous-persisted', 'start-2']),
  );
  await f.runtime.close('closed');
});
