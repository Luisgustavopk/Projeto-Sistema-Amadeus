import { test } from "node:test";
import assert from "node:assert/strict";
import { PcmSample } from "../stt-sample.mjs";

test("exporta PCM16 a 16 kHz sem alterar as amostras do microfone", () => {
  const sample = new PcmSample();
  const frame = new Int16Array(320);
  frame[0] = -32768;
  frame[1] = 32767;
  for (let i = 0; i < 5; i++) sample.append(frame);
  frame[0] = 0;
  const wav = sample.wav();
  const view = new DataView(wav);
  assert.equal(wav.byteLength, 44 + 1600 * 2);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 32767);
});

test("não exporta captura vazia e limita a retenção a 30 segundos", () => {
  const sample = new PcmSample();
  assert.throws(() => sample.wav());
  assert.throws(() => sample.append(new Int16Array(1)));
  for (let i = 0; i < 1499; i++)
    assert.equal(sample.append(new Int16Array(320)), false);
  assert.equal(sample.append(new Int16Array(320)), true);
  assert.throws(() => sample.append(new Int16Array(320)));
  assert.equal(sample.wav().byteLength, 960044);
});
