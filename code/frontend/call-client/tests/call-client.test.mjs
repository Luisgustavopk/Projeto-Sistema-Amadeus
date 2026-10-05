import { test } from "node:test";
import assert from "node:assert/strict";
import { createCallClient } from "../index.mjs";
import { openCall } from "../connection.mjs";

async function fixture(t) {
  let callbacks,
    started,
    clock = 0;
  const sent = [],
    timings = [],
    stops = [],
    listeners = [];
  const socket = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(value) {
      sent.push(typeof value === "string" ? JSON.parse(value) : value);
    },
    addEventListener(type, fn) {
      if (type === "close") listeners.push(fn);
    },
    close() {
      this.onclose?.();
      listeners.splice(0).forEach((fn) => fn());
    },
  };
  class AudioContext {
    state = "running";
    async resume() {}
    async close() {}
  }
  let playing = true;
  const client = await createCallClient(
    { onTiming: (value) => timings.push(value) },
    {
      AudioContext,
      now: () => clock,
      openCall: async () => ({ socket, conversationId: "conversation-fixture", session: { sessionId: "session-fixture" } }),
      createPlayback: (_context, _send, _error, onStart) => {
        started = onStart;
        return {
          isPlaying: () => playing,
          stop(id) {
            stops.push(id);
          },
          metadata() {},
          frame() {},
          done() {},
        };
      },
      createMicrophone: async (_context, events) => {
        callbacks = events;
        return { reset() {}, stop() {} };
      },
    },
  );
  await client.startMicrophone();
  t.after(async () => {
    await client.close();
    socket.close();
  });
  return {
    client,
    callbacks,
    sent,
    timings,
    stops,
    receive(value) {
      socket.onmessage({ data: JSON.stringify(value) });
    },
    audio(value) {
      started(value);
    },
    time(value) {
      clock = value;
    },
    playing(value) {
      playing = value;
    },
  };
}

for (const outcome of ["transcript.final", "error"]) {
  test(`late ${outcome} preserves the next capture and its frame sequence`, async (t) => {
    const f = await fixture(t);
    f.client.text("Resposta anterior");
    f.callbacks.start();
    f.callbacks.end({ silenceMs: 300 });
    f.callbacks.start();
    f.receive({
      type: outcome,
      turnId: 2,
      text: "Fala confirmada",
      code: "NO_SPEECH_DETECTED",
    });
    f.callbacks.frame(new Int16Array(320));
    f.callbacks.end({ silenceMs: 300 });
    const frame = f.sent.find((value) => value instanceof ArrayBuffer);
    assert.ok(frame);
    assert.equal(new DataView(frame).getUint32(4, true), 3);
    assert.equal(new DataView(frame).getUint32(0, true), 0);
    assert.ok(
      f.sent.some((value) => value.type === "speech.end" && value.turnId === 3),
    );
  });
}

test("exports only resumption identifiers and the last observed control sequence", async (t) => {
  const f = await fixture(t);
  f.receive({ type: "state", state: "idle", turnId: 0, seq: 12 });
  f.receive({ type: "state", state: "idle", turnId: 0, seq: 3 });
  assert.deepEqual(f.client.resumeState(), {
    conversationId: "conversation-fixture",
    resume: { previousSessionId: "session-fixture", lastSeq: 12 },
  });
  assert.equal(f.sent.some((event) => event.type === "text.send"), false);
  await assert.rejects(openCall({ apiUrl: "http://127.0.0.1:3001", credential: "synthetic", resume: f.client.resumeState().resume }), /Retomada exige/);
});

test("cuts playback on a recognized word before capture ends, preserving the full utterance", async (t) => {
  const f = await fixture(t);
  f.callbacks.start();
  f.receive({ type: "transcript.partial", turnId: 1, text: "..." });
  assert.equal(f.stops.length, 0);
  f.receive({ type: "transcript.partial", turnId: 1, text: "Espera" });
  assert.deepEqual(f.stops, [1]);
  assert.equal(
    f.sent.some((event) => event.type === "speech.end"),
    false,
  );
  f.callbacks.frame(new Int16Array(320));
  f.callbacks.end({ silenceMs: 300 });
  f.receive({
    type: "transcript.final",
    turnId: 1,
    text: "Espera, quero perguntar outra coisa.",
  });
  assert.equal(
    f.timings.filter((timing) => timing.stage === "automaticInterruption")
      .length,
    1,
  );
  assert.equal(f.sent.filter((event) => event.type === "speech.end").length, 1);
});

test("obsolete partial recognition cannot stop a newer capture", async (t) => {
  const f = await fixture(t);
  f.callbacks.start();
  f.callbacks.end({ silenceMs: 300 });
  f.callbacks.start();
  f.receive({ type: "transcript.partial", turnId: 1, text: "Antiga" });
  assert.equal(f.stops.length, 0);
  f.receive({ type: "transcript.partial", turnId: 2, text: "Atual" });
  assert.deepEqual(f.stops, [2]);
});

test("old text response audio cannot count as the pending voice capture", async (t) => {
  const f = await fixture(t);
  f.client.text("Resposta anterior");
  f.time(1000);
  f.callbacks.start();
  f.time(2000);
  f.callbacks.end({ silenceMs: 300 });
  f.time(2100);
  f.audio({ turnId: 1, scheduledInMs: 20 });
  assert.equal(
    f.timings.filter((value) => value.stage === "firstAudioScheduled").length,
    0,
  );
  assert.deepEqual(f.timings, [
    { stage: "vadEndSilence", turnId: 2, milliseconds: 300 },
  ]);
});

test("measures the confirmed turn once without adding endpoint silence to speech-start timing", async (t) => {
  const f = await fixture(t);
  f.time(1000);
  f.callbacks.start();
  f.time(2000);
  f.callbacks.end({ silenceMs: 300 });
  f.time(2500);
  f.receive({ type: "transcript.final", turnId: 1, text: "Olá" });
  f.time(3100);
  f.audio({ turnId: 1, scheduledInMs: 20 });
  f.audio({ turnId: 1, scheduledInMs: 20 });
  assert.deepEqual(f.timings, [
    { stage: "vadEndSilence", turnId: 1, milliseconds: 300 },
    { stage: "automaticInterruption", turnId: 1, milliseconds: 1500 },
    { stage: "firstAudioScheduled", turnId: 1, milliseconds: 1420 },
    { stage: "vadSpeechStartToFirstAudio", turnId: 1, milliseconds: 2120 },
  ]);
});

test("silent captures and manual stops do not count as automatic interruptions", async (t) => {
  const f = await fixture(t);
  f.callbacks.start();
  f.callbacks.end({ silenceMs: 300 });
  f.receive({ type: "error", turnId: 1, code: "NO_SPEECH_DETECTED" });
  f.playing(false);
  f.callbacks.start();
  f.callbacks.end({ silenceMs: 300 });
  f.receive({ type: "transcript.final", turnId: 2, text: "Olá" });
  f.client.interrupt();
  assert.equal(
    f.timings.filter((value) => value.stage === "automaticInterruption").length,
    0,
  );
  assert.equal(
    f.timings.filter((value) => value.stage === "localInterruption").length,
    1,
  );
});

test("a superseded transcript cannot stop or erase a newer pending recognition", async (t) => {
  const f = await fixture(t);
  f.callbacks.start();
  f.callbacks.end({ silenceMs: 300 });
  f.callbacks.start();
  f.callbacks.end({ silenceMs: 300 });
  f.receive({ type: "transcript.final", turnId: 1, text: "Antiga" });
  assert.equal(f.stops.length, 0);
  f.receive({ type: "transcript.final", turnId: 2, text: "Atual" });
  assert.deepEqual(f.stops, [2]);
});
