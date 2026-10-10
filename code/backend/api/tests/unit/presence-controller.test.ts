import { afterEach, expect, it, vi } from 'vitest';
import { createPresenceController } from '../../src/application/voice/presence-controller.ts';

afterEach(() => vi.useRealTimers());

function fixture(resumed = false) {
  vi.useFakeTimers();
  let busy = false;
  const offer = vi.fn();
  const controller = createPresenceController({
    busy: () => busy,
    offer,
    resumed,
  });
  controller.update({ enabled: true, available: true });

  return { controller, offer, busy: (value: boolean) => (busy = value) };
}

it('oferece uma saudação somente após disponibilidade e aceite não pode ser repetido', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(1500);
  expect(f.offer).toHaveBeenCalledOnce();
  const [id, kind] = f.offer.mock.calls[0]!;
  expect(kind).toBe('greeting');
  expect(f.controller.consume(id)).toBe('greeting');
  expect(f.controller.consume(id)).toBeNull();
  f.controller.idle();
  await vi.advanceTimersByTimeAsync(600000);
  expect(f.offer).toHaveBeenCalledOnce();
  f.controller.close();
});
it('captura/geração impedem oferta; atividade da pessoa cancela uma oferta em trânsito', async () => {
  const f = fixture();
  f.busy(true);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.offer).not.toHaveBeenCalled();
  f.busy(false);
  f.controller.idle();
  await vi.advanceTimersByTimeAsync(1500);
  const id = f.offer.mock.calls[0]![0];
  f.controller.activity(true);
  expect(f.controller.consume(id)).toBeNull();
  f.controller.close();
});
it('respeita silêncio, intervalo e limite; uma iniciativa ignorada não provoca insistência', async () => {
  const f = fixture(true);
  await vi.advanceTimersByTimeAsync(600000);
  expect(f.offer).not.toHaveBeenCalled();
  f.controller.activity(true);
  f.controller.idle();
  await vi.advanceTimersByTimeAsync(89999);
  expect(f.offer).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.offer.mock.calls[0]![1]).toBe('initiative');
  f.controller.decline(f.offer.mock.calls[0]![0]);
  await vi.advanceTimersByTimeAsync(600000);
  expect(f.offer).toHaveBeenCalledOnce();
  f.controller.activity(true);
  f.controller.idle();
  await vi.advanceTimersByTimeAsync(180000);
  expect(f.offer).toHaveBeenCalledTimes(2);
  f.controller.consume(f.offer.mock.calls[1]![0]);
  f.controller.activity(true);
  f.controller.idle();
  await vi.advanceTimersByTimeAsync(600000);
  expect(f.offer).toHaveBeenCalledTimes(2);
  f.controller.close();
});
it.each(['unavailable', 'disabled', 'failure', 'closed'])(
  'cancela timers ao ficar %s',
  async (mode) => {
    const f = fixture();

    if (mode === 'unavailable') {
      f.controller.update({ enabled: true, available: false });
    }

    if (mode === 'disabled') {
      f.controller.update({ enabled: false, available: true });
    }

    if (mode === 'failure') {
      f.controller.pauseAfterFailure();
    }

    if (mode === 'closed') {
      f.controller.close();
    }

    await vi.advanceTimersByTimeAsync(600000);
    expect(f.offer).not.toHaveBeenCalled();
    f.controller.close();
  },
);
