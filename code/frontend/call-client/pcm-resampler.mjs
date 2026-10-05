/** Causal low-pass filter before downsampling; state survives worklet blocks. */
export function createPcmResampler(sourceRate, emit) {
  if (
    !Number.isFinite(sourceRate) ||
    sourceRate < 16000 ||
    sourceRate > 192000
  ) {
    throw new Error("Unsupported microphone sample rate");
  }
  const taps = 63;
  const coefficients = new Float64Array(taps);
  const ring = new Float32Array(taps + 1);
  const cutoff = 7200 / sourceRate;
  let gain = 0;
  for (let index = 0; index < taps; index++) {
    const distance = index - (taps - 1) / 2;
    const sinc =
      distance === 0
        ? 2 * cutoff
        : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance);
    const window =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * index) / (taps - 1)) +
      0.08 * Math.cos((4 * Math.PI * index) / (taps - 1));
    coefficients[index] = sinc * window;
    gain += coefficients[index];
  }
  for (let index = 0; index < taps; index++) coefficients[index] /= gain;
  let position = 0;
  let phase = 0;
  return (input) => {
    for (const sample of input) {
      ring[position] = Number.isFinite(sample) ? sample : 0;
      position = (position + 1) % ring.length;
      phase += 16000;
      if (phase < sourceRate) continue;
      phase -= sourceRate;
      let output = sample;
      if (sourceRate !== 16000) {
        output = 0;
        const fraction = phase / 16000;
        for (let tap = 0; tap < taps; tap++) {
          const now = (position - 1 - tap + ring.length) % ring.length;
          const before = (now - 1 + ring.length) % ring.length;
          output +=
            coefficients[tap] *
            (ring[now] * (1 - fraction) + ring[before] * fraction);
        }
      }
      emit(
        Math.round(
          Math.max(-1, Math.min(1, Number.isFinite(output) ? output : 0)) *
            32767,
        ),
      );
    }
  };
}
