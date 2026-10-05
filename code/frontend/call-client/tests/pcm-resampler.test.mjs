import { test } from "node:test";
import assert from "node:assert/strict";
import { createPcmResampler } from "../pcm-resampler.mjs";

function tone(rate, frequency, blockSize = 128) {
  const output = [];
  const resample = createPcmResampler(rate, (sample) =>
    output.push(sample / 32767),
  );
  const input = Float32Array.from(
    { length: rate },
    (_, index) => 0.5 * Math.sin((2 * Math.PI * frequency * index) / rate),
  );
  for (let offset = 0; offset < input.length; offset += blockSize)
    resample(input.subarray(offset, offset + blockSize));
  const stable = output.slice(100);
  return {
    output,
    rms: Math.sqrt(
      stable.reduce((sum, sample) => sum + sample * sample, 0) / stable.length,
    ),
  };
}

test("preserves speech-band tone and duration at 48 kHz and 44.1 kHz", () => {
  for (const rate of [48000, 44100]) {
    const result = tone(rate, 1000);
    assert.equal(result.output.length, 16000);
    assert.ok(Math.abs(result.rms - Math.sqrt(0.125)) < 0.02);
    assert.deepEqual(result.output, tone(rate, 1000, 307).output);
  }
});

test("attenuates out-of-band tones before they alias into speech", () => {
  for (const rate of [48000, 44100]) assert.ok(tone(rate, 12000).rms < 0.005);
});

test("preserves native 16 kHz PCM and rejects unsupported input rates", () => {
  const values = [];
  createPcmResampler(16000, (sample) => values.push(sample))([
    0,
    0.5,
    -0.5,
    2,
    NaN,
  ]);
  assert.deepEqual(values, [0, 16384, -16383, 32767, 0]);
  assert.throws(() => createPcmResampler(8000, () => {}));
});
