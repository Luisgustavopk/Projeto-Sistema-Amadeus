import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCallClosure } from "../connection-status.mjs";

test("distinguishes restart, abnormal disconnect and playback failure", () => {
  assert.match(
    describeCallClosure({ code: 4001 }),
    /substituída por outra conexão/,
  );
  assert.match(describeCallClosure({ code: 1012 }), /API foi reiniciada/);
  assert.match(describeCallClosure({ code: 1006 }), /perdeu a conexão/);
  assert.match(
    describeCallClosure({ code: 1008, reason: "Invalid playback" }),
    /áudio inválido/,
  );
  assert.equal(
    describeCallClosure({ code: 1000, reason: "Session ended" }),
    null,
  );
  assert.match(
    describeCallClosure({ code: 1000, reason: "Voice connection expired" }),
    /limite de duração/,
  );
});
