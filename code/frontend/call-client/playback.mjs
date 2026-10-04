export function createPlayback(context, send, onError, onStart) {
  let pending = null;
  let cursor = context.currentTime;
  let turnId = 0;
  let completed = null;
  const sources = new Set();
  const confirmations = new Set();
  const finish = () => {
    if (completed && sources.size === 0) {
      send({ type: "playback.ended", responseId: completed });
      completed = null;
    }
  };
  const progress = (item, ended = false) => {
    const playedSamples = Math.max(
      item.last,
      Math.min(
        item.meta.sampleCount,
        ended
          ? item.meta.sampleCount
          : Math.floor((context.currentTime - item.start) * 16000),
      ),
    );
    if (playedSamples > item.last) {
      send({
        type: "playback.progress",
        responseId: item.meta.responseId,
        segmentId: item.meta.segmentId,
        playedSamples,
      });
      item.last = playedSamples;
    }
  };
  return {
    isPlaying() {
      return [...confirmations].some(
        (item) =>
          context.currentTime >= item.start &&
          context.currentTime < item.start + item.meta.sampleCount / 16000,
      );
    },
    stop(nextTurn = turnId) {
      for (const item of confirmations) {
        progress(item);
        clearInterval(item.timer);
      }
      confirmations.clear();
      for (const source of sources) {
        source.onended = null;
        source.stop();
      }
      sources.clear();
      pending = null;
      completed = null;
      cursor = context.currentTime;
      turnId = nextTurn;
    },
    metadata(meta) {
      if (meta.turnId !== turnId) {
        pending = null;
        return;
      }
      if (
        !Number.isInteger(meta.frameCount) ||
        meta.frameCount < 1 ||
        meta.frameCount > 4500 ||
        meta.sampleCount < 1 ||
        meta.sampleCount > meta.frameCount * 320 ||
        Math.ceil(meta.sampleCount / 320) !== meta.frameCount ||
        pending
      ) {
        onError(new Error("Invalid audio metadata"));
        return;
      }
      pending = { meta, next: 0, pcm: new Int16Array(meta.frameCount * 320) };
    },
    frame(buffer) {
      if (!pending) {
        return;
      }
      if (buffer.byteLength !== 648) {
        onError(new Error("Invalid audio frame"));
        return;
      }
      const view = new DataView(buffer);
      if (
        buffer.byteLength !== 648 ||
        view.getUint32(0, true) !== pending.next ||
        view.getUint32(4, true) !== turnId
      ) {
        onError(new Error("Invalid audio sequence"));
        return;
      }
      for (let index = 0; index < 320; index++) {
        pending.pcm[pending.next * 320 + index] = view.getInt16(
          8 + index * 2,
          true,
        );
      }
      if (++pending.next !== pending.meta.frameCount) {
        return;
      }
      const { meta, pcm } = pending;
      pending = null;
      if (cursor - context.currentTime + meta.sampleCount / 16000 > 90) {
        onError(new Error("Playback queue exceeds 90 seconds"));
        return;
      }
      const audio = context.createBuffer(1, meta.sampleCount, 16000);
      const samples = audio.getChannelData(0);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = pcm[index] / 32768;
      }
      const source = context.createBufferSource();
      source.buffer = audio;
      source.connect(context.destination);
      const start = Math.max(context.currentTime + 0.02, cursor);
      cursor = start + audio.duration;
      const item = { meta, start, last: 0, timer: null };
      item.timer = setInterval(() => progress(item), 500);
      confirmations.add(item);
      sources.add(source);
      source.onended = () => {
        progress(item, true);
        clearInterval(item.timer);
        confirmations.delete(item);
        sources.delete(source);
        source.disconnect();
        finish();
      };
      source.start(start);
      onStart?.({
        turnId,
        scheduledInMs: (start - context.currentTime) * 1000,
        sampleCount: meta.sampleCount,
      });
    },
    done(responseId) {
      completed = responseId;
      finish();
    },
  };
}
