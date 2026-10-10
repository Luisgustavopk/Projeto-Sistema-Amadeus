import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayback } from "../playback.mjs";
function fixture(onPlayback) {
  const sent = [];
  const sources = [];
  const context = {
    currentTime: 0,
    destination: {},
    createBuffer(_channels, length, rate) {
      return {
        getChannelData: () => new Float32Array(length),
        duration: length / rate,
      };
    },
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {},
        startTime: null,
        start(when) {
          this.startTime = when;
        },
        stop() {},
      };
      sources.push(source);
      return source;
    },
  };
  const player = createPlayback(
    context,
    (event) => sent.push(event),
    (error) => {
      throw error;
    },
    undefined,
    onPlayback,
  );
  player.stop(1);
  return { player, context, sent, sources };
}
function fill(f) {
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "segment",
    sampleCount: 640,
    sampleRate: 16000,
    frameCount: 2,
  });
  for (let index = 0; index < 2; index++) {
    const frame = new ArrayBuffer(648);
    const view = new DataView(frame);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(frame);
  }
}

function liveFrames(f, count) {
  for (let index = 0; index < count; index++) {
    const data = new ArrayBuffer(648);
    const view = new DataView(data);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(data);
  }
}

test("a expressão acompanha o relógio de áudio, mesmo se o timer disparar antes do início real", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const states = [];
  let f;
  f = fixture(() => {
    if (f) states.push(f.player.activeSegment()?.segmentId ?? null);
  });
  try {
    fill(f);
    states.length = 0;
    t.mock.timers.tick(25);
    assert.deepEqual(states, []);
    f.context.currentTime = 0.021;
    t.mock.timers.tick(25);
    assert.deepEqual(states, ["segment"]);
    f.context.currentTime = 0.061;
    f.sources[0].onended();
    assert.equal(states.at(-1), null);
  } finally {
    f.player.stop();
  }
});

test("receiving the end of a queued minute does not confirm unheard audio", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = fixture();
  try {
    f.player.startStream({
      turnId: 1,
      responseId: "response",
      segmentId: "live",
      sampleRate: 16000,
    });
    liveFrames(f, 3000);
    t.mock.timers.tick(500);
    assert.equal(f.sent.length, 0);
    f.player.endStream({
      turnId: 1,
      responseId: "response",
      segmentId: "live",
      sampleCount: 960000,
      frameCount: 3000,
    });
    assert.equal(f.sent.length, 0);
    f.context.currentTime = 0.07;
    f.player.stop();
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].playedSamples, 800);
  } finally {
    f.player.stop();
  }
});

test("stream end emits one cumulative confirmation for the part actually heard", () => {
  const f = fixture();
  try {
    f.player.startStream({
      turnId: 1,
      responseId: "response",
      segmentId: "live",
      sampleRate: 16000,
    });
    liveFrames(f, 100);
    f.context.currentTime = 0.27;
    f.player.endStream({
      turnId: 1,
      responseId: "response",
      segmentId: "live",
      sampleCount: 32000,
      frameCount: 100,
    });
    assert.equal(f.sent.length, 1);
    assert.ok(Math.abs(f.sent[0].playedSamples - 4000) <= 1);
    f.context.currentTime = 0.37;
    f.player.stop();
    assert.ok(Math.abs(f.sent.at(-1).playedSamples - 5600) <= 1);
  } finally {
    f.player.stop();
  }
});

test("late stream end does not duplicate a final confirmation", () => {
  const f = fixture();
  try {
    f.player.startStream({
      turnId: 1,
      responseId: "response",
      segmentId: "live",
      sampleRate: 16000,
    });
    liveFrames(f, 5);
    f.context.currentTime = 0.12;
    f.sources[0].onended();
    f.player.endStream({
      turnId: 1,
      responseId: "response",
      segmentId: "live",
      sampleCount: 1600,
      frameCount: 5,
    });
    assert.equal(
      f.sent.filter((event) => event.type === "playback.progress").length,
      1,
    );
    assert.equal(f.sent[0].playedSamples, 1600);
  } finally {
    f.player.stop();
  }
});

test("plays a live stream before its final size and excludes padding from confirmation", () => {
  const f = fixture();
  f.player.startStream({
    turnId: 1,
    responseId: "response",
    segmentId: "live",
    sampleRate: 24000,
  });
  const frame = (index) => {
    const data = new ArrayBuffer(968);
    const view = new DataView(data);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(data);
  };
  for (let index = 0; index < 5; index++) frame(index);
  assert.equal(f.sources.length, 1);
  f.player.endStream({
    turnId: 1,
    responseId: "response",
    segmentId: "live",
    sampleCount: 2500,
    frameCount: 6,
  });
  frame(5);
  assert.equal(f.sources.at(-1).buffer.duration, 100 / 24000);
  f.player.done("response");
  f.context.currentTime = 1;
  for (const source of f.sources) source.onended();
  assert.equal(
    f.sent.filter((event) => event.type === "playback.progress").at(-1)
      .playedSamples,
    2500,
  );
  assert.equal(f.sent.at(-1).type, "playback.ended");
  f.player.stop();
});

test("interruption of a stream confirms only heard samples and accepts a new stream", () => {
  const f = fixture();
  f.player.startStream({
    turnId: 1,
    responseId: "response",
    segmentId: "live",
    sampleRate: 16000,
  });
  for (let index = 0; index < 5; index++) {
    const data = new ArrayBuffer(648);
    const view = new DataView(data);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(data);
  }
  f.context.currentTime = 0.07;
  f.player.stop(2);
  assert.equal(f.sent[0].playedSamples, 800);
  f.player.startStream({
    turnId: 2,
    responseId: "next",
    segmentId: "fresh",
    sampleRate: 24000,
  });
  f.player.endStream({
    turnId: 1,
    responseId: "response",
    segmentId: "live",
    sampleCount: 1600,
    frameCount: 5,
  });
  f.player.stop();
});

test("24 kHz preserves samples, timing and interruption progress, then plays a 16 kHz fallback", () => {
  const f = fixture();
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "hd",
    sampleRate: 24000,
    sampleCount: 2500,
    frameCount: 6,
  });
  for (let index = 0; index < 6; index++) {
    const frame = new ArrayBuffer(968);
    const view = new DataView(frame);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(frame);
  }
  assert.equal(f.sources.length, 2);
  assert.equal(f.sources[0].buffer.duration, 0.1);
  assert.equal(f.sources[1].buffer.duration, 100 / 24000);
  f.context.currentTime = 0.07;
  f.player.stop(1);
  assert.equal(f.sent[0].playedSamples, 1200);
  fill(f);
  assert.equal(f.sources.at(-1).buffer.duration, 640 / 16000);
  f.player.stop();
});

test("a minute of chunked playback stays below the server's 180 acknowledgements limit", () => {
  const f = fixture();
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "segment",
    sampleCount: 960000,
    sampleRate: 16000,
    frameCount: 3000,
  });
  for (let index = 0; index < 3000; index++) {
    const frame = new ArrayBuffer(648);
    const view = new DataView(frame);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(frame);
  }
  assert.equal(f.sources.length, 600);
  for (const source of f.sources) {
    f.context.currentTime = source.startTime + source.buffer.duration;
    source.onended();
  }
  const acks = f.sent.filter((event) => event.type === "playback.progress");
  assert.ok(acks.length <= 122, `Received ${acks.length} acknowledgements`);
  assert.equal(acks.at(-1).playedSamples, 960000);
  for (let index = 1; index < acks.length; index++)
    assert.ok(acks[index].playedSamples > acks[index - 1].playedSamples);
  f.player.stop();
});
test("confirms only samples actually played when interrupted", () => {
  const f = fixture();
  fill(f);
  assert.equal(f.player.isPlaying(), false);
  f.context.currentTime = 0.04;
  assert.equal(f.player.isPlaying(), true);
  f.player.stop(2);
  assert.equal(f.player.isPlaying(), false);
  assert.equal(f.sent[0].playedSamples, 320);
  assert.equal(
    f.sent.some((event) => event.type === "playback.ended"),
    false,
  );
});
test("acknowledges complete segment and playback end", () => {
  const f = fixture();
  fill(f);
  f.player.done("response");
  f.context.currentTime = 0.06;
  f.sources[0].onended();
  assert.equal(f.sent[0].playedSamples, 640);
  assert.equal(f.sent[1].type, "playback.ended");
  f.player.stop();
});
test("rejects malformed frame before reading header", () => {
  const f = fixture();
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "segment",
    sampleCount: 320,
    sampleRate: 16000,
    frameCount: 1,
  });
  assert.throws(
    () => f.player.frame(new ArrayBuffer(1)),
    /Invalid audio frame/,
  );
  f.player.stop();
});

test("segments of one response are scheduled sequentially without overlap", () => {
  const f = fixture();
  fill(f);
  fill(f);
  assert.equal(f.sources.length, 2);
  assert.ok(
    f.sources[1].startTime >=
      f.sources[0].startTime + f.sources[0].buffer.duration,
  );
  f.player.stop();
});

test("starts with 100ms received without waiting for a complete segment", () => {
  const f = fixture();
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "segment",
    sampleCount: 3200,
    sampleRate: 16000,
    frameCount: 10,
  });
  const frame = (index, turn = 1) => {
    const buffer = new ArrayBuffer(648);
    const view = new DataView(buffer);
    view.setUint32(0, index, true);
    view.setUint32(4, turn, true);
    return buffer;
  };
  for (let index = 0; index < 4; index++) f.player.frame(frame(index));
  assert.equal(f.sources.length, 0);
  f.player.frame(frame(4));
  assert.equal(f.sources.length, 1);
  f.context.currentTime = 0.07;
  f.player.stop(2);
  assert.equal(f.sent[0].playedSamples, 800);
  f.player.frame(frame(5));
  assert.equal(f.sources.length, 1);
});

test("late metadata of an old turn cannot erase the current segment", () => {
  const f = fixture();
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "segment",
    sampleCount: 640,
    sampleRate: 16000,
    frameCount: 2,
  });
  f.player.metadata({
    turnId: 0,
    responseId: "old",
    segmentId: "old",
    sampleCount: 640,
    sampleRate: 16000,
    frameCount: 2,
  });
  for (let index = 0; index < 2; index++) {
    const frame = new ArrayBuffer(648);
    const view = new DataView(frame);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(frame);
  }
  assert.equal(f.sources.length, 1);
  f.player.stop();
});

test("progress across chunks is cumulative and final padding is not played", () => {
  const f = fixture();
  f.player.metadata({
    turnId: 1,
    responseId: "response",
    segmentId: "segment",
    sampleCount: 1700,
    sampleRate: 16000,
    frameCount: 6,
  });
  for (let index = 0; index < 6; index++) {
    const frame = new ArrayBuffer(648);
    const view = new DataView(frame);
    view.setUint32(0, index, true);
    view.setUint32(4, 1, true);
    f.player.frame(frame);
  }
  assert.equal(f.sources.length, 2);
  f.player.done("response");
  f.context.currentTime = 1;
  f.sources[0].onended();
  assert.equal(f.sent[0].playedSamples, 1600);
  assert.equal(
    f.sent.some((event) => event.type === "playback.ended"),
    false,
  );
  f.sources[1].onended();
  assert.equal(f.sent[1].playedSamples, 1700);
  assert.equal(f.sent[2].type, "playback.ended");
  f.player.stop();
});
