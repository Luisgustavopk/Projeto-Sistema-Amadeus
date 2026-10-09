import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAvatarClock } from '../src/features/avatar/runtime/avatar-clock.mjs';

test('repeated activation keeps one clock; redraws cannot advance an active animation', () => {
  const listeners = new Set();
  let starts = 0;
  let time = 0;
  const app = {
    ticker: {
      deltaMS: 33,
      add: (listener) => listeners.add(listener),
      remove: (listener) => listeners.delete(listener),
      start: () => starts++,
      stop() {},
    },
    renderer: { render() {} },
    stage: {},
  };
  const clock = createAvatarClock(app, {
    update: (milliseconds) => (time += milliseconds),
  });
  for (let i = 0; i < 100; i++) {
    clock.setRunning(true);
    clock.drawStill();
  }
  assert.equal(listeners.size, 1);
  assert.equal(starts, 1);
  assert.equal(time, 0);
  for (const update of listeners) update();
  assert.equal(time, 33);
  for (let i = 0; i < 25; i++) {
    clock.setRunning(false);
    clock.setRunning(true);
  }
  assert.equal(listeners.size, 1);
  const before = time;
  for (const update of listeners) update();
  assert.equal(time - before, 33);
  clock.destroy();
  assert.equal(listeners.size, 0);
});
