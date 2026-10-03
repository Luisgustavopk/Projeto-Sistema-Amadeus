import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoiceBaseline } from "../baseline.mjs";
test("does not claim acceptance without enough real samples", () => {
  const baseline = createVoiceBaseline();
  baseline.record({ stage: "firstAudioScheduled", milliseconds: 100 });
  assert.equal(baseline.summary().sufficientSample, false);
  assert.equal(baseline.summary().firstAudioTargetMet, false);
});
test("computes median and p95 with minimum sample requirements", () => {
  const baseline = createVoiceBaseline();
  for (let index = 1; index <= 100; index++) {
    baseline.record({ stage: "firstAudioScheduled", milliseconds: index });
  }
  for (let index = 1; index <= 30; index++) {
    baseline.record({ stage: "localInterruption", milliseconds: index });
  }
  const result = baseline.summary();
  assert.equal(result.firstAudioScheduled.medianMs, 50.5);
  assert.equal(result.localInterruption.p95Ms, 29);
  assert.equal(result.sufficientSample, true);
  assert.equal(result.hardwareAcceptanceConfirmed, false);
});
