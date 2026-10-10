import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeRgbaPng, encodeRgbaPng } from './lib/png-rgba.mjs';
import { refineContinuousHairOutline } from './lib/continuous-hair-outline.mjs';
import { refineReferenceHairOutline } from './lib/reference-hair-outline.mjs';

const authoring = new URL('../../assets/avatar/authoring/', import.meta.url);
const local = new URL('../../assets/avatar/local/pose-candidates-v1/', import.meta.url);
const version = process.argv[2] ?? '5';
if (!['2', '3', '4', '5'].includes(version)) throw new Error('Supported contour revisions: 2, 3, 4, 5');
const spec = JSON.parse(await readFile(new URL('hair-contour-v' + version + '.json', authoring), 'utf8'));
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const clamp = (value) => Math.max(0, Math.min(1, value));
const results = [];
let reference;
if (spec.reference) {
  if (!/^[a-z-]+\.png$/.test(spec.reference)) throw new Error('Invalid reference file name');
  if (hash(await readFile(new URL(spec.reference, local))) !== spec.referenceSha256) throw new Error('Reference changed');
  reference = decodeRgbaPng(await readFile(new URL(spec.reference, local)));
}

for (const change of spec.changes) {
  for (const file of [change.source, change.output]) if (!/^[a-z-]+-v[1-9]\d*\.png$/.test(file)) throw new Error('Invalid file name');
  const source = await readFile(new URL(change.source, local));
  if (hash(source) !== change.sourceSha256) throw new Error('Source changed: ' + change.source);
  const image = decodeRgbaPng(source), original = Buffer.from(image.rgba);
  const { width, height } = image;
  const [left, top, right, bottom] = change.region;
  if (left < 0 || top < 0 || right > width || bottom > height) throw new Error('Region outside image');
  const opaque = (x, y) => x >= 0 && y >= 0 && x < width && y < height && original[(y * width + x) * 4 + 3] >= spec.alphaThreshold;
  let changedPixels = 0;
  const changedBounds = [width, height, -1, -1];
  if (spec.algorithm === 'reference-profile') {
    refineReferenceHairOutline(image, original, reference, spec, change);
  } else if (spec.algorithm === 'continuous-outline') {
    refineContinuousHairOutline(image, original, spec, change);
  } else for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      if (!original[i + 3]) continue;
      const inside = opaque(x, y);
      let distance = Infinity;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (opaque(x + dx, y + dy) !== inside) distance = Math.min(distance, Math.hypot(dx, dy));
        }
      }
      // Thin interior stroke; transparent edge pixels keep their original alpha.
      // The short fade joins the existing contour without a visible endpoint.
      const strength = (inside ? clamp(spec.widthPixels + .5 - distance) : distance <= 1.5 ? 1 : 0)
        * clamp((x - left) / change.endFadePixels)
        * clamp((bottom - 1 - y) / change.endFadePixels);
      if (!strength) continue;
      let changed = false;
      for (let channel = 0; channel < 3; channel++) {
        // Darken only: never recolour already darker original linework.
        const value = Math.round(original[i + channel] + (Math.min(original[i + channel], spec.colour[channel]) - original[i + channel]) * strength);
        image.rgba[i + channel] = value;
        changed ||= value !== original[i + channel];
      }
      if (changed) {
        changedPixels++;
        changedBounds[0] = Math.min(changedBounds[0], x); changedBounds[1] = Math.min(changedBounds[1], y);
        changedBounds[2] = Math.max(changedBounds[2], x); changedBounds[3] = Math.max(changedBounds[3], y);
      }
    }
  }
  if (['continuous-outline', 'reference-profile'].includes(spec.algorithm)) {
    for (let i = 0; i < original.length; i += 4) {
      if (image.rgba.subarray(i, i + 4).equals(original.subarray(i, i + 4))) continue;
      const x = (i / 4) % width, y = Math.floor(i / 4 / width);
      changedPixels++;
      changedBounds[0] = Math.min(changedBounds[0], x); changedBounds[1] = Math.min(changedBounds[1], y);
      changedBounds[2] = Math.max(changedBounds[2], x); changedBounds[3] = Math.max(changedBounds[3], y);
    }
  }
  if (!changedPixels) throw new Error('No contour repair: ' + change.id);
  let alphaChangedPixels = 0;
  for (let i = 0; i < original.length; i += 4) {
    if (image.rgba[i + 3] !== original[i + 3]) alphaChangedPixels++;
    if (spec.alphaPolicy !== 'edge-only' && image.rgba[i + 3] !== original[i + 3]) throw new Error('Alpha changed');
    if (!original[i + 3] && image.rgba[i + 3]) throw new Error('Silhouette expanded into transparent pixel');
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    if ((x < left || x >= right || y < top || y >= bottom) && !image.rgba.subarray(i, i + 4).equals(original.subarray(i, i + 4))) throw new Error('Pixel changed outside region');
  }
  const output = encodeRgbaPng(image);
  if (!decodeRgbaPng(output).rgba.equals(image.rgba)) throw new Error('PNG roundtrip changed pixels');
  try { await writeFile(new URL(change.output, local), output, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await readFile(new URL(change.output, local))).equals(output)) throw error;
  }
  results.push({ id: change.id, source: change.source, output: change.output, sha256: hash(output), width, height, changedPixels, changedBounds, alphaChangedPixels, alphaUnchanged: alphaChangedPixels === 0, outsideRegionUnchanged: true });
}
await writeFile(new URL('contour-provenance-v' + version + '.json', local), JSON.stringify({ ...spec, results }, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
