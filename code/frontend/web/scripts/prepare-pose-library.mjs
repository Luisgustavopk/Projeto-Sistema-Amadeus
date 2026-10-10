import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodeRgbaPng } from './lib/png-rgba.mjs';
import { writeLayeredPsd } from './lib/write-layered-psd.mjs';

const authoring = new URL('../../assets/avatar/authoring/', import.meta.url);
const input = new URL('../../assets/avatar/local/pose-layers-v1/', import.meta.url);
const output = new URL('../../assets/avatar/local/cubism-import-v1/', import.meta.url);
const original = new URL('../../assets/avatar/local/authoring-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('provenance.json', input), 'utf8'));
const approved = JSON.parse(await readFile(new URL('pose-candidates-v1.json', authoring), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (approved.status !== 'artwork-approved' || approved.approval?.scope !== 'artwork-only')
  throw new Error('Approved artwork is required');
const width = 1000, height = 1800, activePose = 'hand-on-hip';
const merged = Buffer.alloc(width * height * 4), groups = [], inventory = [];
for (const pose of manifest.poses) {
  if (!/^[a-z-]+$/.test(pose.id)) throw new Error('Invalid pose path');
  const source = approved.poses.find(p => p.id === pose.id);
  const bytes = await readFile(new URL(pose.id + '/approved.png', input));
  if (!source || sha(bytes) !== source.sha256 || source.sha256 !== pose.sourceSha256)
    throw new Error('Pose approval mismatch: ' + pose.id);
  const image = decodeRgbaPng(bytes);
  if (image.width > width || image.height > height) throw new Error('Canvas too small');
  const reconstructed = Buffer.alloc(image.rgba.length), layers = [];
  const owned = new Uint8Array(image.width * image.height);
  for (const part of pose.layers) {
    if (!/^[a-z][a-z-]*$/.test(part.id)) throw new Error('Invalid layer path');
    const png = await readFile(new URL(pose.id + '/' + part.id + '.png', input));
    if (sha(png) !== part.pngSha256) throw new Error('Layer changed: ' + part.id);
    const crop = decodeRgbaPng(png);
    if (crop.width !== part.width || crop.height !== part.height)
      throw new Error('Layer dimensions changed: ' + part.id);
    if (part.left < 0 || part.top < 0 || part.left + crop.width > image.width || part.top + crop.height > image.height)
      throw new Error('Layer outside source canvas');
    for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
      const from = (y * crop.width + x) * 4, n = (y + part.top) * image.width + x + part.left;
      if (!crop.rgba.subarray(from, from + 4).some(v => v !== 0)) continue;
      if (owned[n]) throw new Error('Overlapping approved pixels');
      owned[n] = 1;
      crop.rgba.copy(reconstructed, n * 4, from, from + 4);
    }
    layers.push({
      id: pose.id + '--' + part.id, left: part.left, top: part.top,
      width: crop.width, height: crop.height, rgba: crop.rgba.toString('base64'),
    });
  }
  if (!reconstructed.equals(image.rgba)) throw new Error('Pose reconstruction mismatch');
  if (pose.id === activePose) for (let y = 0; y < image.height; y++)
    image.rgba.copy(merged, y * width * 4, y * image.width * 4, (y + 1) * image.width * 4);
  groups.push({ id: pose.id, visible: pose.id === activePose, layers });
  inventory.push({
    id: pose.id, sourceSha256: source.sha256, layerCount: layers.length,
    pixelIdentical: true, origin: [0, 0], joints: pose.joints,
    parameters: pose.parameters, occlusions: pose.occlusions,
  });
}
if (!groups.some(g => g.visible)) throw new Error('Active pose is missing');
let icc;
if (process.platform === 'win32') {
  try { icc = await readFile(new URL('file:///C:/Windows/System32/spool/drivers/color/sRGB%20Color%20Space%20Profile.icm')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const psd = writeLayeredPsd({ width, height, layers: groups, merged, icc });
await mkdir(output, { recursive: true });
await writeFile(new URL('pose-library.psd', output), psd);
const originalBases = [];
for (const state of ['neutral', 'hand-on-chin']) {
  const metadata = JSON.parse(await readFile(new URL(state + '/layers.json', original), 'utf8'));
  const composite = await readFile(new URL(state + '/original-composite.png', original));
  const image = decodeRgbaPng(composite), layers = [];
  if (image.width !== metadata.width || image.height !== metadata.height)
    throw new Error('Original base dimensions mismatch');
  for (const layer of metadata.layers) {
    if (!/^ArtMesh\d+$/.test(layer.id)) throw new Error('Invalid original layer ID');
    const crop = decodeRgbaPng(await readFile(new URL(state + '/' + layer.id + '.png', original)));
    if (crop.width !== layer.width || crop.height !== layer.height)
      throw new Error('Original layer dimensions mismatch');
    layers.push({ ...layer, rgba: crop.rgba.toString('base64') });
  }
  // The source index already follows the renderer's back-to-front draw order.
  if (layers.some((l, i) => i && l.order < layers[i - 1].order))
    throw new Error('Original draw order is not sorted');
  const base = writeLayeredPsd({ ...metadata, layers, merged: image.rgba, icc });
  const file = 'original-' + state + '.psd';
  await writeFile(new URL(file, output), base);
  await writeFile(new URL(state + '-palette-reference.png', output),
    await readFile(new URL(state + '/current-palette-reference.png', original)));
  originalBases.push({
    state, file, layers: layers.length, psdSha256: sha(base),
    sourceCompositeSha256: sha(composite), sourceColours: true,
    originalProjectRecovered: false,
  });
}
await writeFile(new URL('import-manifest.json', output), JSON.stringify({
  version: 1, status: 'import-preparation', canvas: [width, height],
  defaultVisiblePose: activePose, sourceManifestSha256: sha(await readFile(new URL('provenance.json', input))),
  psdSha256: sha(psd), resampled: false, poses: inventory, originalBases,
  importedInCubism: false, hiddenArtworkComplete: false,
  facialControlsReady: false, runtimeEnabled: false,
}, null, 2) + '\n');
await writeFile(new URL('IMPORTAR.md', output), await readFile(new URL('CUBISM-IMPORTAR.md', authoring)));
console.log('Grouped PSD: ' + fileURLToPath(new URL('pose-library.psd', output)));
console.log('4 pose folders, 56 lossless cutouts; Cubism import and rigging remain pending.');
