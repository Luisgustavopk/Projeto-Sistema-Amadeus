import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayback } from "../playback.mjs";
function fixture() {
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
      const source = { connect() {}, disconnect() {}, start() {}, stop() {} };
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
test("confirms only samples actually played when interrupted", () => {
  const f = fixture();
  fill(f);
  f.context.currentTime = 0.04;
  f.player.stop(2);
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
    frameCount: 1,
  });
  assert.throws(
    () => f.player.frame(new ArrayBuffer(1)),
    /Invalid audio frame/,
  );
  f.player.stop();
});
