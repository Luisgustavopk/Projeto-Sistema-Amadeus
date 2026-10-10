import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodeRgbaPng, encodeRgbaPng } from './lib/png-rgba.mjs';
import { partitionPoseArt } from './lib/partition-pose-art.mjs';
import { writeLayeredPsd } from './lib/write-layered-psd.mjs';

const authoring = new URL('../../assets/avatar/authoring/', import.meta.url);
const input = new URL('../../assets/avatar/local/pose-candidates-v1/', import.meta.url);
const output = new URL('../../assets/avatar/local/pose-layers-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('pose-candidates-v1.json', authoring), 'utf8'));
const selections = JSON.parse(await readFile(new URL('pose-layer-selections-v1.json', authoring), 'utf8'));
const blueprint = JSON.parse(await readFile(new URL('rig-blueprint.json', authoring), 'utf8'));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
if (manifest.status !== 'artwork-approved' || manifest.approval?.scope !== 'artwork-only')
  throw new Error('Artwork must be approved before preparing layers');
await mkdir(output, { recursive: true });
let icc;
if (process.platform === 'win32') {
  try { icc = await readFile(new URL('file:///C:/Windows/System32/spool/drivers/color/sRGB%20Color%20Space%20Profile.icm')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const inventory = [];
for (const pose of manifest.poses) {
  if (!/^[a-z-]+$/.test(pose.id) || !/^[a-z-]+-v\d+\.png$/.test(pose.file)) throw new Error('Invalid pose path');
  const art = await readFile(new URL(pose.file, input));
  if (hash(art) !== pose.sha256) throw new Error('Approved artwork changed: ' + pose.id);
  const image = decodeRgbaPng(art), selection = selections.poses.find(s => s.id === pose.id);
  if (!selection || selection.size[0] !== image.width || selection.size[1] !== image.height)
    throw new Error('Selection dimensions mismatch: ' + pose.id);
  const destination = new URL(pose.id + '/', output);
  await mkdir(destination, { recursive: true });
  const { layers, composite } = partitionPoseArt(image, selection.layers);
  for (const layer of layers) await writeFile(new URL(layer.id + '.png', destination), layer.png);
  await writeFile(new URL('approved.png', destination), art);
  await writeFile(new URL('recomposed.png', destination), encodeRgbaPng({ ...image, rgba: composite }));
  const psd = writeLayeredPsd({ width: image.width, height: image.height, layers, merged: composite, icc });
  await writeFile(new URL('visible-parts.psd', destination), psd);
  const record = {
    id: pose.id, label: pose.label, width: image.width, height: image.height, bounds: pose.bounds,
    source: pose.file, sourceSha256: pose.sha256, psdSha256: hash(psd),
    compositePixelIdentical: true, hiddenArtworkComplete: false, facialRigReady: false,
    parameters: blueprint.poses.find(p => p.id === pose.id)?.parameters,
    joints: selection.joints, occlusions: selection.occlusions,
    layers: layers.map(({ rgba, png, polygon, fallback, ...layer }) => ({ ...layer, pngSha256: hash(png) })),
  };
  await writeFile(new URL('layers.json', destination), JSON.stringify(record, null, 2) + '\n');
  inventory.push(record);
  if (hash(await readFile(new URL(pose.file, input))) !== pose.sha256) throw new Error('Source modified');
  console.log(pose.id + ': ' + layers.length + ' visible layers; recomposition pixel-identical');
}
const review = {
  version: selections.version, status: selections.status, runtimeEnabled: false,
  approvedManifestVersion: manifest.version, approval: manifest.approval,
  selectionsSha256: hash(await readFile(new URL('pose-layer-selections-v1.json', authoring))),
  limitations: selections.limitations, poses: inventory,
};
await writeFile(new URL('provenance.json', output), JSON.stringify(review, null, 2) + '\n');
for (const name of ['review.css', 'review.js', 'AUTORIA.md'])
  await writeFile(new URL(name, output), await readFile(new URL('layer-review/' + name, authoring)));
const template = await readFile(new URL('layer-review/index.html', authoring), 'utf8');
await writeFile(new URL('index.html', output), template.replace('__LAYER_MANIFEST__', JSON.stringify(review).replaceAll('<', '\\u003c')));
console.log('Layer review: ' + fileURLToPath(new URL('index.html', output)));
