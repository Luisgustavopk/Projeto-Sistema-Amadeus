import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoiceBaseline } from "../baseline.mjs";
test("does not claim acceptance without enough real samples", () => {
  const baseline = createVoiceBaseline();
  baseline.record({ stage: "firstAudioScheduled", milliseconds: 100 });
  baseline.record({ stage: "vadSpeechStartToFirstAudio", milliseconds: 200 });
  assert.equal(baseline.summary().sufficientSample, false);
  assert.equal(baseline.summary().firstAudioTargetMet, false);
  assert.equal(baseline.summary().interruptionTargetMet, false);
});
test("computes median and p95 with minimum sample requirements", () => {
  const baseline = createVoiceBaseline();
  for (let index = 1; index <= 100; index++) {
    baseline.record({ stage: "firstAudioScheduled", milliseconds: index });
    baseline.record({
      stage: "vadSpeechStartToFirstAudio",
      milliseconds: index + 100,
    });
  }
  for (let index = 1; index <= 30; index++) {
    baseline.record({ stage: "automaticInterruption", milliseconds: index });
  }
  const result = baseline.summary();
  assert.equal(result.firstAudioScheduled.medianMs, 50.5);
  assert.equal(result.speechStartToFirstAudio.medianMs, 150.5);
  assert.equal(result.firstAudioScheduled.maxMs, 100);
  assert.equal(result.automaticInterruption.p95Ms, 29);
  assert.equal(result.sufficientSample, true);
  assert.equal(result.hardwareAcceptanceConfirmed, false);
});
test("accepts the documented median target while recording outliers", () => {
  const baseline = createVoiceBaseline();
  for (let index = 0; index < 100; index++) {
    baseline.record({
      stage: "firstAudioScheduled",
      milliseconds: index === 99 ? 2001 : 100,
    });
    baseline.record({
      stage: "vadSpeechStartToFirstAudio",
      milliseconds: 100,
    });
  }
  for (let index = 0; index < 30; index++) {
    baseline.record({ stage: "automaticInterruption", milliseconds: 10 });
  }
  assert.equal(baseline.summary().firstAudioTargetMet, true);
  assert.equal(baseline.summary().firstAudioScheduled.maxMs, 2001);
});

test("manual stops cannot satisfy the automatic-interruption sample gate", () => {
  const baseline = createVoiceBaseline();
  for (let i = 0; i < 100; i++)
    baseline.record({ stage: "firstAudioScheduled", milliseconds: 100 });
  for (let i = 0; i < 30; i++)
    baseline.record({ stage: "localInterruption", milliseconds: 1 });
  assert.equal(baseline.summary().sufficientSample, false);
  assert.equal(baseline.summary().interruptionTargetMet, false);
});

test("reports a failing automatic-interruption target and rejects invalid samples", () => {
  const baseline = createVoiceBaseline();
  for (let i = 0; i < 30; i++)
    baseline.record({ stage: "automaticInterruption", milliseconds: 2000 });
  baseline.record({ stage: "vadEndSilence", milliseconds: 300 });
  assert.equal(baseline.summary().interruptionTargetMet, false);
  assert.equal(baseline.summary().firstAudioScheduled.samples, 0);
  assert.throws(() =>
    baseline.record({ stage: "firstAudioScheduled", milliseconds: NaN }),
  );
});
