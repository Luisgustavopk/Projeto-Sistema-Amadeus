import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionPoseArt } from '../scripts/lib/partition-pose-art.mjs';
import { decodeRgbaPng } from '../scripts/lib/png-rgba.mjs';

function image(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return { width, height, rgba, chunks: [{ type: 'IHDR', data: header }] };
}

test('partially transparent artwork survives overlapping selections without duplication or gaps', () => {
  const pixels = Buffer.from([
    120, 50, 40, 128, 30, 20, 10, 255, 70, 60, 50, 32,
    90, 70, 50, 64, 200, 180, 160, 255, 5, 6, 7, 0,
  ]);
  const result = partitionPoseArt(image(3, 2, pixels), [
    { id: 'body', fallback: true },
    { id: 'arm', polygon: [[0,0],[2,0],[2,2],[0,2]] },
    { id: 'hand', polygon: [[1,0],[2,0],[2,2],[1,2]] },
  ]);
  assert.ok(result.composite.equals(pixels));
  assert.equal(result.layers.find(l=>l.id==='arm').visiblePixels, 2);
  assert.equal(result.layers.find(l=>l.id==='hand').visiblePixels, 2);
  for (const layer of result.layers)
    assert.ok(decodeRgbaPng(layer.png).rgba.equals(Buffer.from(layer.rgba, 'base64')));
});
