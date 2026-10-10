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

test('PSD alternatives remain separate folders with one hidden and intact child channels', () => {
  const rgba = Buffer.from([20, 30, 40, 255]);
  const raster = id => ({ id, left: 0, top: 0, width: 1, height: 1, rgba: rgba.toString('base64') });
  const psd = writeLayeredPsd({ width: 1, height: 1, merged: rgba, layers: [
    { id: 'visible-pose', layers: [raster('visible-art')] },
    { id: 'hidden-pose', visible: false, layers: [raster('hidden-art')] },
  ] });
  let offset = 26;
  for (let n = 0; n < 2; n++) offset += 4 + psd.readUInt32BE(offset);
  offset += 8; // Layer/mask section length and layer-info length.
  const count = -psd.readInt16BE(offset);
  offset += 2;
  const records = [];
  for (let n = 0; n < count; n++) {
    offset += 16; // Layer rectangle.
    const channels = psd.readUInt16BE(offset);
    offset += 2 + channels * 6 + 8; // Channel lengths and blend mode.
    const visible = !(psd[offset + 2] & 2);
    offset += 4;
    const extraEnd = offset + 4 + psd.readUInt32BE(offset);
    offset += 4;
    for (let k = 0; k < 2; k++) offset += 4 + psd.readUInt32BE(offset);
    const nameSize = psd[offset];
    const name = psd.subarray(offset + 1, offset + 1 + nameSize).toString('ascii');
    offset += Math.ceil((nameSize + 1) / 4) * 4;
    let divider = 0;
    while (offset < extraEnd) {
      const key = psd.subarray(offset + 4, offset + 8).toString('ascii');
      const length = psd.readUInt32BE(offset + 8);
      if (key === 'lsct') divider = psd.readUInt32BE(offset + 12);
      offset += 12 + length + length % 2;
    }
    records.push({ name, visible, divider, channels });
  }
  assert.deepEqual(records, [
    { name: 'visible-pose-end', visible: false, divider: 3, channels: 0 },
    { name: 'visible-art', visible: true, divider: 0, channels: 4 },
    { name: 'visible-pose', visible: true, divider: 1, channels: 0 },
    { name: 'hidden-pose-end', visible: false, divider: 3, channels: 0 },
    { name: 'hidden-art', visible: true, divider: 0, channels: 4 },
    { name: 'hidden-pose', visible: false, divider: 1, channels: 0 },
  ]);
});
