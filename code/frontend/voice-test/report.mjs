export function createTestReport() {
  const timings = [];
  const events = [];

  return {
    timing(sample) {
      timings.push({ stage: sample.stage, turnId: sample.turnId, milliseconds: sample.milliseconds, recordedAt: new Date().toISOString() });
      if (timings.length > 2000) timings.shift();
    },
    event(event) {
      // Export only operational metadata, never tokens or conversation content.
      events.push({ type: event.type, code: event.code, turnId: event.turnId, recordedAt: new Date().toISOString() });
      if (events.length > 2000) events.shift();
    },
    snapshot(summary) {
      return { exportedAt: new Date().toISOString(), summary, timings: structuredClone(timings), events: structuredClone(events) };
    },
  };
}
