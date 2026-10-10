import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { writeLayeredPsd } from '../scripts/lib/write-layered-psd.mjs';

test('PSD merged preview carries white-matted RGB and original alpha', () => {
  const rgba = Buffer.from([100, 50, 0, 128, 30, 20, 10, 255, 4, 5, 6, 0]);
  const psd = writeLayeredPsd({ width: 3, height: 1, merged: rgba, layers: [
    { id: 'art', left: 0, top: 0, width: 3, height: 1, rgba: rgba.toString('base64') },
  ] });
  assert.equal(psd.subarray(0, 4).toString(), '8BPS');
  // Walk the three length-delimited PSD sections to the merged image data.
  let offset = 26;
  for (let n = 0; n < 3; n++) offset += 4 + psd.readUInt32BE(offset);
  assert.equal(psd.readUInt16BE(offset), 2);
  const planes = inflateSync(psd.subarray(offset + 2));
  assert.deepEqual([...planes], [177,30,255, 152,20,255, 127,10,255, 128,255,0]);
});
