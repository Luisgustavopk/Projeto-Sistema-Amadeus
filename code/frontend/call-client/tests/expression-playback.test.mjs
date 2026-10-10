import { test } from "node:test";
import assert from "node:assert/strict";
import { createExpressionPlayback } from "../expression-playback.mjs";

test("aplica expressão no áudio correspondente, aceita atualização e descarta fala anterior", () => {
  const received = [];
  const state = createExpressionPlayback((event) => received.push(event));
  state.reset(1);
  const a = {
    responseId: "response",
    segmentId: "a",
    turnId: 1,
    emotion: "neutra",
    phase: "initial",
  };
  const b = { ...a, segmentId: "b" };
  state.receive(a);
  assert.deepEqual(received, [null]);
  state.playing(a);
  assert.equal(received.at(-1), a);
  const update = { ...a, emotion: "irritacao", phase: "update" };
  state.receive(update);
  assert.equal(received.at(-1), update);
  state.receive(b);
  assert.equal(received.at(-1), update);
  state.playing(b);
  assert.equal(received.at(-1), b);
  state.receive({ ...update, emotion: "raiva" });
  assert.equal(received.at(-1), b);
  state.playing(null);
  state.receive({ ...b, phase: "update", emotion: "alegria" });
  assert.equal(received.at(-1), null);
  state.reset(2);
  state.receive(update);
  assert.equal(received.at(-1), null);
});

test("um intervalo entre chunks do mesmo segmento não transfere a expressão nem elimina a atualização", () => {
  const received = [];
  const state = createExpressionPlayback((event) => received.push(event));
  state.reset(1);
  const event = {
    responseId: "r",
    segmentId: "s",
    turnId: 1,
    emotion: "neutra",
  };
  state.receive(event);
  state.playing(event);
  state.playing(null);
  const update = { ...event, emotion: "curiosidade" };
  state.receive(update);
  assert.equal(received.at(-1), null);
  state.playing(event);
  assert.equal(received.at(-1), update);
});
