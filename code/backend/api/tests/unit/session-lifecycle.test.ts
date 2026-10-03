import { afterEach, expect, it, vi } from 'vitest';
import { createSessionLifecycle } from '../../src/realtime/session/lifecycle.ts';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('encerra conexões que não negociam no prazo e libera os timers', () => {
  vi.useFakeTimers();

  const close = vi.fn();
  const lifecycle = createSessionLifecycle(close);

  vi.advanceTimersByTime(4999);
  expect(close).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1);
  expect(close).toHaveBeenCalledWith(1008, 'Negotiation timeout');

  lifecycle.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it('cancela o prazo de negociação, renova a cota e limita a duração da conexão', () => {
  vi.useFakeTimers();

  const close = vi.fn();
  const lifecycle = createSessionLifecycle(close);
  lifecycle.negotiated();

  for (let index = 0; index < 120; index++) {
    expect(lifecycle.allowEvent()).toBe(true);
  }

  expect(lifecycle.allowEvent()).toBe(false);
  vi.advanceTimersByTime(5000);
  expect(close).not.toHaveBeenCalled();

  vi.advanceTimersByTime(55000);
  expect(close).toHaveBeenCalledWith(1000, 'Foundation connection expired');
  expect(lifecycle.allowEvent()).toBe(true);

  lifecycle.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
