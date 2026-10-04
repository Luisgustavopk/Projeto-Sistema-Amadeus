import { test } from "node:test";
import assert from "node:assert/strict";
import { createCallClient } from "../index.mjs";

async function fixture(t) {
  const errors = [],
    events = [],
    sources = [],
    sent = [];
  let context, resume;
  const listeners = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send(value) {
      sent.push(JSON.parse(value));
    },
    addEventListener(type, listener) {
      if (type === "close") listeners.push(listener);
    },
    close(code = 1000, reason = "") {
      this.readyState = WebSocket.CLOSED;
      this.onclose?.({ code, reason, wasClean: true });
      listeners.splice(0).forEach((listener) => listener());
    },
  };
  class AudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() {
      context = this;
    }
    async resume() {
      if (this.state !== "running")
        await new Promise((resolve) => {
          resume = resolve;
        });
    }
    async close() {
      this.state = "closed";
    }
    createBuffer(_channels, length, rate) {
      return {
        getChannelData: () => new Float32Array(length),
        duration: length / rate,
      };
    }
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {},
        start() {},
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    }
  }
  const client = await createCallClient(
    {
      onError: (error) => errors.push(error.message),
      onEvent: (event) => events.push(event),
    },
    { AudioContext, openCall: async () => ({ socket }) },
  );
  client.text("Teste sintético de entrega de áudio.");
  t.after(async () => {
    await client.close();
    socket.close();
  });
  const receive = (value) => socket.onmessage({ data: JSON.stringify(value) });
  const frame = (sequence) => {
    const data = new ArrayBuffer(648),
      view = new DataView(data);
    view.setUint32(0, sequence, true);
    view.setUint32(4, 1, true);
    socket.onmessage({ data });
  };
  return {
    socket,
    context,
    errors,
    events,
    sources,
    sent,
    receive,
    frame,
    resume() {
      context.state = "running";
      resume();
    },
    metadata(segmentId) {
      receive({
        type: "audio.segment",
        turnId: 1,
        responseId: "response",
        segmentId,
        sampleCount: 640,
        frameCount: 2,
      });
    },
  };
}

test("preserves metadata and PCM order while browser audio resumes", async (t) => {
  const f = await fixture(t);
  f.context.state = "suspended";
  f.metadata("first");
  f.frame(0);
  await Promise.resolve();
  f.frame(1);
  f.metadata("second");
  f.frame(0);
  f.frame(1);
  f.receive({ type: "reply.done", turnId: 1, responseId: "response" });
  f.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.errors, []);
  assert.equal(f.socket.readyState, WebSocket.OPEN);
  assert.equal(f.sources.length, 2);
  assert.equal(f.events.filter((e) => e.type === "audio.segment").length, 2);
  f.sources.forEach((source) => source.onended());
  assert.equal(f.sent.at(-1).type, "playback.ended");
});

test("a resumed frame cannot overtake a queued frame of the same segment", async (t) => {
  const f = await fixture(t);
  f.context.state = "suspended";
  f.metadata("first");
  f.frame(0);
  await Promise.resolve();
  f.resume();
  f.frame(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.errors, []);
  assert.equal(f.sources.length, 1);
  assert.equal(f.socket.readyState, WebSocket.OPEN);
});

test("reports the close code and reason instead of an unexplained disconnect", async (t) => {
  const f = await fixture(t);
  f.socket.close(1012, "Service restart");
  assert.deepEqual(f.events.at(-1), {
    type: "connection.closed",
    code: 1012,
    reason: "Service restart",
    wasClean: true,
  });
});

test("a replaced call stops every scheduled source and closes its audio context", async (t) => {
  const f = await fixture(t);
  f.metadata("first");
  f.frame(0);
  f.frame(1);
  assert.equal(f.sources.length, 1);
  f.socket.close(4001, "Voice session replaced");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.sources[0].stopped, true);
  assert.equal(f.sources[0].onended, null);
  assert.equal(f.context.state, "closed");
});
