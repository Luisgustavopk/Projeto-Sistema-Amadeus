export function createVoiceMetrics() {
  const counts = {
    turns: 0,
    noSpeech: 0,
    completed: 0,
    interrupted: 0,
    failed: 0,
    textFallbacks: 0,
    personaMetadataFallbacks: 0,
    personaRecoveries: 0,
    inputClarifications: 0,
    memoryReplyRecoveries: 0,
    memoryReviewUnavailable: 0,
  };
  const durations = new Map<string, number[]>();
  const failureReasons = new Map<string, number>();

  return {
    count(key: keyof typeof counts) {
      counts[key]++;
    },
    failure(code: string) {
      failureReasons.set(code, (failureReasons.get(code) ?? 0) + 1);
    },
    time(stage: string, milliseconds: number) {
      const samples = durations.get(stage) ?? [];
      samples.push(milliseconds);

      if (samples.length > 1000) {
        samples.shift();
      }

      durations.set(stage, samples);
    },
    snapshot() {
      return {
        ...counts,
        failureReasons: Object.fromEntries(failureReasons),
        stages: Object.fromEntries(
          [...durations].map(([stage, values]) => {
            const sorted = [...values].sort((a, b) => a - b);

            return [
              stage,
              {
                samples: sorted.length,
                p50Ms:
                  sorted.length % 2
                    ? sorted[Math.floor(sorted.length / 2)]
                    : (sorted[sorted.length / 2 - 1]! +
                        sorted[sorted.length / 2]!) /
                      2,
                p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
              },
            ];
          }),
        ),
        residentMemoryBytes: process.memoryUsage().rss,
      };
    },
  };
}

export type VoiceMetrics = ReturnType<typeof createVoiceMetrics>;
