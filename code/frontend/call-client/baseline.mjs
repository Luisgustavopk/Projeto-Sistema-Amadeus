export function createVoiceBaseline() {
  const firstAudio = [];
  const interruptions = [];
  const statistics = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
      samples: sorted.length,
      medianMs: sorted.length
        ? sorted.length % 2
          ? sorted[middle]
          : (sorted[middle - 1] + sorted[middle]) / 2
        : null,
      p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
    };
  };
  return {
    record(sample) {
      if (!Number.isFinite(sample.milliseconds) || sample.milliseconds < 0) {
        throw new Error("Invalid latency measurement");
      }
      const target =
        sample.stage === "firstAudioScheduled"
          ? firstAudio
          : sample.stage === "localInterruption"
            ? interruptions
            : null;
      if (target) {
        target.push(sample.milliseconds);
        if (target.length > 1000) {
          target.shift();
        }
      }
    },
    summary() {
      const audio = statistics(firstAudio);
      const interruption = statistics(interruptions);
      return {
        firstAudioScheduled: audio,
        localInterruption: interruption,
        sufficientSample: audio.samples >= 100 && interruption.samples >= 30,
        firstAudioTargetMet: audio.samples >= 100 && audio.medianMs <= 2000,
        interruptionTargetMet:
          interruption.samples >= 30 && interruption.p95Ms <= 500,
        measurement:
          "Browser scheduling estimate including VAD trailing silence; physical output and network cancellation need separate validation",
        hardwareAcceptanceConfirmed: false,
      };
    },
  };
}
