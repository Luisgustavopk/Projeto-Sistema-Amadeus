import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceActivityDetector } from "../vad.mjs";
test("preserves pre-roll and ends after bounded silence", () => {
  const vad = new VoiceActivityDetector({
    silenceFrames: 5,
    preRollFrames: 5,
    startFrames: 1,
  });
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

test("detects speech after 160 ms and ends after a 300 ms pause by default", () => {
  const vad = new VoiceActivityDetector();
  const speech = new Int16Array(320).fill(2000);
  const silence = new Int16Array(320);
  for (let index = 0; index < 7; index++) {
    assert.equal(vad.accept(speech).start, false);
  }
  assert.equal(vad.accept(speech).start, true);
  for (let index = 0; index < 14; index++) {
    assert.equal(vad.accept(silence).end, false);
  }
  const end = vad.accept(silence);
  assert.equal(end.end, true);
  assert.equal(end.silenceMs, 300);
});

test("ignores noise bursts shorter than 160 ms and preserves speech onset", () => {
  const vad = new VoiceActivityDetector();
  const silence = new Int16Array(320);
  const speech = new Int16Array(320).fill(1400);
  for (let index = 0; index < 10; index++) {
    for (let burst = 0; burst < 7; burst++) {
      assert.equal(vad.accept(speech).start, false);
    }
    assert.equal(vad.accept(silence).start, false);
  }
  for (let index = 0; index < 7; index++) {
    assert.equal(vad.accept(speech).start, false);
  }
  const onset = vad.accept(speech);
  assert.equal(onset.start, true);
  assert.equal(onset.frames.length, 8);
});

test("ignores sustained low-level noise below the speech threshold", () => {
  const vad = new VoiceActivityDetector();
  const lowNoise = new Int16Array(320).fill(600);

  for (let index = 0; index < 100; index++) {
    assert.equal(vad.accept(lowNoise).start, false);
  }
});
