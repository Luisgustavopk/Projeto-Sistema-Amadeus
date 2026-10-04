// Timings belong to an input turn, never to whichever capture is newest.
export function createVoiceTimings(now, emit) {
  const turns = new Map();

  return {
    start(turnId) {
      turns.set(turnId, { startedAt: now(), confirmed: false });
      if (turns.size > 256) turns.delete(turns.keys().next().value);
    },
    end(turnId, silenceMs) {
      const turn = turns.get(turnId);
      if (!turn) return;
      turn.endedAt = now();
      turn.silenceMs = silenceMs;
      emit?.({ stage: "vadEndSilence", turnId, milliseconds: silenceMs });
    },
    confirm(turnId, wasPlaying) {
      const turn = turns.get(turnId);
      if (!turn || turn.confirmed) return;
      turn.confirmed = true;
      if (wasPlaying) {
        emit?.({
          stage: "automaticInterruption",
          turnId,
          milliseconds: now() - turn.startedAt,
        });
      }
    },
    firstAudio({ turnId, scheduledInMs }) {
      const turn = turns.get(turnId);
      if (!turn?.confirmed || turn.endedAt === undefined || turn.measured)
        return;
      turn.measured = true;
      const scheduledAt = now() + scheduledInMs;
      emit?.({
        stage: "firstAudioScheduled",
        turnId,
        milliseconds: scheduledAt - turn.endedAt + turn.silenceMs,
      });
      emit?.({
        stage: "vadSpeechStartToFirstAudio",
        turnId,
        milliseconds: scheduledAt - turn.startedAt,
      });
    },
    discard(turnId) {
      turns.delete(turnId);
    },
    clear() {
      turns.clear();
    },
  };
}
