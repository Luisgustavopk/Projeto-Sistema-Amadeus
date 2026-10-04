import { expect, it, vi } from 'vitest';
import { createVoiceSessions } from '../../src/application/voice/sessions.ts';
import { createVoiceMetrics } from '../../src/application/voice/metrics.ts';
import type { CallHistoryRepository } from '../../src/ports/call-history-repository.ts';

function fixture() {
  const started: string[] = [];
  const connected = new Set<string>();
  const history: CallHistoryRepository = {
    startSession: async (input) => {
      started.push(input.id);
      connected.add(input.id);
    },
    endSession: async (id) => {
      connected.delete(id);
    },
    beginTurn: async () => {},
    updateTurn: async () => {},
    recent: async () => [],
    addSegment: async () => {},
    setAudio: async () => {},
    acknowledge: async () => true,
  };
  const sessions = createVoiceSessions({
    ownerId: 'owner',
    history,
    profiles: { active: async () => null },
    providers: {
      execute: async () => ({
        content: 'Synthetic',
        inputTokens: null,
        outputTokens: null,
      }),
      async *executeStream() {
        yield { content: 'Synthetic', inputTokens: null, outputTokens: null };
      },
    },
    gate: { beginExecution: () => () => {} },
    metrics: createVoiceMetrics(),
  });
  const open = (
    sessionId: string,
    onReplaced = async () => {},
    signal?: AbortSignal,
  ) =>
    sessions.open({
      sessionId,
      conversationId: 'conversation',
      dataClass: 'synthetic',
      onReplaced,
      ...(signal ? { signal } : {}),
      sink: { send() {}, audio: async () => {} },
    });

  return { sessions, open, started, connected };
}

it('serializa duas substituições concorrentes e deixa apenas a última chamada ativa', async () => {
  const f = fixture();

  let finish = () => {};

  const closing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const firstReplaced = vi.fn(async () => {
    await closing;
  });
  const secondReplaced = vi.fn(async () => {});
  await f.open('first', firstReplaced);
  const second = f.open('second', secondReplaced);
  const third = f.open('third');
  await vi.waitFor(() => expect(firstReplaced).toHaveBeenCalledOnce());
  expect(f.started).toEqual(['first']);
  finish();
  await Promise.all([second, third]);
  expect(secondReplaced).toHaveBeenCalledOnce();
  expect(f.started).toEqual(['first', 'second', 'third']);
  expect([...f.connected]).toEqual(['third']);
  await f.sessions.shutdown();
  expect(f.connected.size).toBe(0);
});

it('uma negociação cancelada não toma posse da chamada existente', async () => {
  const f = fixture();
  const firstReplaced = vi.fn(async () => {});
  await f.open('first', firstReplaced);
  const abort = new AbortController();
  const canceled = f.open('canceled', async () => {}, abort.signal);
  abort.abort();
  await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
  expect(firstReplaced).not.toHaveBeenCalled();
  expect([...f.connected]).toEqual(['first']);
  await f.sessions.shutdown();
});
