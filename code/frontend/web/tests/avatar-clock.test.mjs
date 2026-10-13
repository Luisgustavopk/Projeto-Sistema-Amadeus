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

test('the extra renderer samples the primary model after its update on the same clock', () => {
  let advance;
  const calls = [];
  const app = {
    ticker: { deltaMS: 33, add(callback) { advance = callback; }, remove() {}, start() {}, stop() {} },
    renderer: { render() { calls.push('render'); } }, stage: {},
  };
  const clock = createAvatarClock(app,
    { update() { calls.push('primary'); } },
    () => calls.push('presentation'),
    () => calls.push('extra'));
  clock.setRunning(true); advance();
  assert.deepEqual(calls, ['presentation', 'primary', 'extra']);
  calls.length = 0; clock.drawStill(); assert.deepEqual(calls, []);
  clock.setRunning(false);
  assert.deepEqual(calls, ['presentation', 'primary', 'extra', 'render']);
  clock.destroy();
});

test('a hidden Pixi model advances the core once and leaves no pending render delta', () => {
  let tick, updates = 0;
  const model = {
    visible: false, deltaTime: 0, elapsedTime: 0,
    update(dt) { this.deltaTime += dt; this.elapsedTime += dt; },
    internalModel: { update(dt) { assert.equal(dt,33); updates++; } },
  };
  const app = { ticker: { deltaMS:33,add(fn){tick=fn;},remove(){},start(){},stop(){} }, renderer:{render(){}},stage:{} };
  const clock = createAvatarClock(app,model,()=>{},()=>assert.equal(model.deltaTime,0));
  clock.setRunning(true);
  for(let i=0;i<10;i++) tick();
  assert.equal(updates,10); assert.equal(model.elapsedTime,330); assert.equal(model.deltaTime,0);
  clock.destroy();
});
