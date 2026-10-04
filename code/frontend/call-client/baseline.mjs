export function createVoiceBaseline() {
  const firstAudio = [];
  const speechStartToAudio = [];
  const interruptions = [];
  const automaticInterruptions = [];
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
      maxMs: sorted.length ? sorted[sorted.length - 1] : null,
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
          : sample.stage === "vadSpeechStartToFirstAudio"
            ? speechStartToAudio
            : sample.stage === "localInterruption"
              ? interruptions
              : sample.stage === "automaticInterruption"
                ? automaticInterruptions
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
      const speechStart = statistics(speechStartToAudio);
      const interruption = statistics(interruptions);
      const automatic = statistics(automaticInterruptions);
      return {
        firstAudioScheduled: audio,
        speechStartToFirstAudio: speechStart,
        localInterruption: interruption,
        automaticInterruption: automatic,
        sufficientSample: audio.samples >= 100 && automatic.samples >= 30,
        firstAudioTargetMet: audio.samples >= 100 && audio.medianMs <= 2000,
        interruptionTargetMet:
          automatic.samples >= 30 && automatic.p95Ms <= 500,
        measurement:
          "Response: estimated end of speech to scheduled audio, including VAD tail. Automatic interruption: VAD onset detection to local playback stop after final STT confirmation, only while audio was playing. Physical input/output and VAD onset delay require separate hardware measurement. Speech duration and manual stops are diagnostic only.",
        hardwareAcceptanceConfirmed: false,
      };
    },
  };
}
