import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceActivityDetector } from "../vad.mjs";
test("preserves pre-roll and ends after bounded silence", () => {
  const vad = new VoiceActivityDetector({ silenceFrames: 5, startFrames: 1 });
  const silence = new Int16Array(320);
  const speech = new Int16Array(320).fill(2000);
  for (let index = 0; index < 8; index++) {
    assert.equal(vad.accept(silence).start, false);
  }
  const start = vad.accept(speech);
  assert.equal(start.start, true);
  assert.equal(start.frames.length, 5);
  for (let index = 0; index < 4; index++) {
    assert.equal(vad.accept(silence).end, false);
  }
  assert.equal(vad.accept(silence).end, true);
  assert.equal(vad.accept(silence).frames.length, 0);
});
test("caps continuous speech at 30 seconds", () => {
  const vad = new VoiceActivityDetector({ startFrames: 1 });
  const speech = new Int16Array(320).fill(2000);
  assert.equal(vad.accept(speech).start, true);
  for (let index = 1; index < 1499; index++) {
    assert.equal(vad.accept(speech).end, false);
  }
  assert.equal(vad.accept(speech).end, true);
});
test("rejects malformed PCM frames", () =>
  assert.throws(() => new VoiceActivityDetector().accept(new Int16Array(2))));

test("ignores isolated noise spikes and preserves speech onset", () => {
  const vad = new VoiceActivityDetector();
  const silence = new Int16Array(320);
  const speech = new Int16Array(320).fill(2000);
  for (let index=0; index<10; index++) {
    assert.equal(vad.accept(speech).start, false);
    assert.equal(vad.accept(silence).start, false);
  }
  for (let index=0; index<3; index++) assert.equal(vad.accept(speech).start, false);
  const onset=vad.accept(speech);
  assert.equal(onset.start, true);
  assert.equal(onset.frames.length, 5);
});
