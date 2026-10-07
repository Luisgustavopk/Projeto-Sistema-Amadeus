export function createPlayback(context, send, onError, onStart) {
  let pending = null;
  let cursor = context.currentTime;
  let turnId = 0;
  let completed = null;
  const sources = new Set();
  const confirmations = new Set();
  let lastProgressTime = -Infinity;
  const finish = () => {
    if (completed && sources.size === 0 && !pending) {
      send({ type: "playback.ended", responseId: completed });
      completed = null;
    }
  };
  const progress = (item, ended = false, force = false) => {
    // Queue offsets do not prove playback; timers run for future sources too.
    if (context.currentTime < item.start) return;
    const playedSamples = Math.max(
      item.last,
      Math.min(
        item.count,
        ended
          ? item.count
          : Math.floor(
              (context.currentTime - item.start) * item.meta.sampleRate,
            ),
      ),
    );
    const totalPlayed = item.offset + playedSamples;
    item.segment.heard = Math.max(item.segment.heard ?? 0, totalPlayed);
    const final = totalPlayed === item.meta.sampleCount;
    if (
      totalPlayed > item.segment.last &&
      (force || final || context.currentTime - lastProgressTime >= 0.5)
    ) {
      send({
        type: "playback.progress",
        responseId: item.meta.responseId,
        segmentId: item.meta.segmentId,
        playedSamples: totalPlayed,
      });
      item.segment.last = totalPlayed;
      lastProgressTime = context.currentTime;
    }
  };
  const schedule = (segment, end) => {
    const { meta, pcm } = segment;
    const offset = segment.scheduled;
    const count = Math.min(end, meta.sampleCount) - offset;
    if (count <= 0) return;
    if (cursor - context.currentTime + count / meta.sampleRate > 90) {
      onError(new Error("Playback queue exceeds 90 seconds"));
      return;
    }
    const audio = context.createBuffer(1, count, meta.sampleRate);
    const samples = audio.getChannelData(0);
    for (let index = 0; index < count; index++) {
      samples[index] = pcm[offset + index] / 32768;
    }
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + 0.02, cursor);
    cursor = start + audio.duration;
    const item = { meta, start, offset, count, last: 0, segment, timer: null };
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
    if (offset === 0) {
      onStart?.({
        turnId,
        scheduledInMs: (start - context.currentTime) * 1000,
        sampleCount: meta.sampleCount,
      });
    }
    segment.scheduled += count;
  };
  return {
    abortStream(meta) {
      if (
        pending?.streaming &&
        pending.meta.segmentId === meta.segmentId &&
        meta.turnId === turnId
      )
        pending = null;
    },
    startStream(meta) {
      if (meta.turnId !== turnId) return;
      if (![16000, 24000].includes(meta.sampleRate) || pending) {
        onError(new Error("Invalid streaming audio metadata"));
        return;
      }
      const capacity = meta.sampleRate * 90;
      pending = {
        meta: { ...meta, sampleCount: capacity, frameCount: 4500 },
        streaming: true,
        frameSamples: meta.sampleRate / 50,
        next: 0,
        pcm: new Int16Array(capacity),
        scheduled: 0,
        last: 0,
      };
    },
    endStream(meta) {
      if (meta.turnId !== turnId) return;
      if (
        !pending?.streaming ||
        pending.meta.segmentId !== meta.segmentId ||
        pending.meta.responseId !== meta.responseId ||
        !Number.isInteger(meta.sampleCount) ||
        meta.sampleCount < 1 ||
        meta.sampleCount > pending.pcm.length ||
        Math.ceil(meta.sampleCount / pending.frameSamples) !==
          meta.frameCount ||
        meta.frameCount < pending.next ||
        meta.frameCount > pending.next + 1
      ) {
        onError(new Error("Invalid streaming audio end"));
        return;
      }
      Object.assign(pending.meta, {
        sampleCount: meta.sampleCount,
        frameCount: meta.frameCount,
      });
      pending.streaming = false;
      if (pending.next === meta.frameCount) {
        schedule(pending, meta.sampleCount);
        const started = [...confirmations].filter(
          (item) =>
            item.segment === pending && context.currentTime >= item.start,
        );
        const latest = started.reduce(
          (previous, item) =>
            !previous || item.offset > previous.offset ? item : previous,
          null,
        );
        if (latest) progress(latest, false, true);
        // A short stream may finish playing before its final size arrives.
        if (
          pending.heard >= meta.sampleCount &&
          pending.last < meta.sampleCount
        ) {
          send({
            type: "playback.progress",
            responseId: meta.responseId,
            segmentId: meta.segmentId,
            playedSamples: meta.sampleCount,
          });
          pending.last = meta.sampleCount;
          lastProgressTime = context.currentTime;
        }
        pending = null;
        finish();
      }
    },
    isPlaying() {
      return [...confirmations].some(
        (item) =>
          context.currentTime >= item.start &&
          context.currentTime < item.start + item.count / item.meta.sampleRate,
      );
    },
    stop(nextTurn = turnId) {
      const latest = new Map();
      for (const item of confirmations) {
        if (context.currentTime >= item.start) {
          const previous = latest.get(item.meta.segmentId);
          if (!previous || item.offset > previous.offset)
            latest.set(item.meta.segmentId, item);
        }
        clearInterval(item.timer);
      }
      for (const item of latest.values()) progress(item, false, true);
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
      lastProgressTime = -Infinity;
    },
    metadata(meta) {
      const frameSamples = meta.sampleRate / 50;
      if (meta.turnId !== turnId) {
        return;
      }
      if (
        ![16000, 24000].includes(meta.sampleRate) ||
        !Number.isInteger(meta.frameCount) ||
        meta.frameCount < 1 ||
        meta.frameCount > 4500 ||
        !Number.isInteger(meta.sampleCount) ||
        meta.sampleCount < 1 ||
        meta.sampleCount > meta.frameCount * frameSamples ||
        Math.ceil(meta.sampleCount / frameSamples) !== meta.frameCount ||
        pending
      ) {
        onError(new Error("Invalid audio metadata"));
        return;
      }
      pending = {
        meta,
        frameSamples,
        next: 0,
        pcm: new Int16Array(meta.frameCount * frameSamples),
        scheduled: 0,
        last: 0,
      };
    },
    frame(buffer) {
      if (!pending) {
        return;
      }
      if (buffer.byteLength !== 8 + pending.frameSamples * 2) {
        onError(new Error("Invalid audio frame"));
        return;
      }
      const view = new DataView(buffer);
      if (view.getUint32(4, true) !== turnId) return;
      if (
        buffer.byteLength !== 8 + pending.frameSamples * 2 ||
        view.getUint32(0, true) !== pending.next ||
        pending.next >= pending.meta.frameCount ||
        view.getUint32(4, true) !== turnId
      ) {
        onError(new Error("Invalid audio sequence"));
        return;
      }
      for (let index = 0; index < pending.frameSamples; index++) {
        pending.pcm[pending.next * pending.frameSamples + index] =
          view.getInt16(8 + index * 2, true);
      }
      pending.next++;
      // Start after 100 ms of received PCM; do not await a whole segment.
      // Progressive streams may still be generating the rest of this segment.
      if (pending.next % 5 === 0 || pending.next === pending.meta.frameCount) {
        schedule(pending, pending.next * pending.frameSamples);
      }
      if (!pending.streaming && pending.next === pending.meta.frameCount) {
        pending = null;
        finish();
      }
    },
    done(responseId) {
      completed = responseId;
      finish();
    },
  };
}
