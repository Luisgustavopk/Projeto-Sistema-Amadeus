import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const authoring = new URL('../../assets/avatar/authoring/', import.meta.url);
const local = new URL('../../assets/avatar/local/', import.meta.url);
const output = new URL('pose-candidates-v1/', local);
const manifest = JSON.parse(await readFile(new URL('pose-candidates-v1.json', authoring), 'utf8'));
await mkdir(output, { recursive: true });

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const reference = await readFile(new URL(manifest.reference, local));
if (digest(reference) !== manifest.referenceSha256) throw new Error('Review reference changed; remeasure its bounds.');
for (const pose of manifest.poses) {
  if (!/^[a-z-]+-v[1-9]\d*\.png$/.test(pose.file)) throw new Error('Invalid candidate file');
  const png = await readFile(new URL(pose.file, output));
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG: ' + pose.file);
  pose.width = png.readUInt32BE(16);
  pose.height = png.readUInt32BE(20);
  if (digest(png) !== pose.sha256) throw new Error('Candidate changed; version and remeasure it: ' + pose.file);
  if (pose.previousFile) {
    if (!/^[a-z-]+-v[1-9]\d*\.png$/.test(pose.previousFile)) throw new Error('Invalid previous file');
    const previous = await readFile(new URL(pose.previousFile, output));
    if (digest(previous) !== pose.previousSha256) throw new Error('Approved previous drawing changed: ' + pose.previousFile);
  }
}

// Keep the current compiled avatar and textures unchanged.
const originals = {
  'Kurisu.moc3': 'd6b2ef7f8f93bb9313c0a117a9dcfe2286de314204657bfa88b17b7531fe5718',
  'Kurisu.model3.json': '405b2bee1a658fe610c45aa03cb858eb3e6ef68b9851ddd27a9930bd06320ce2',
  'Kurisu.4096/texture_00.png': 'c1551392e9f62ed69d7e12233ff0d2700711164b51667ae9072c1f3161841f33',
};
for (const [file, expected] of Object.entries(originals)) {
  if (digest(await readFile(new URL('modern/Kurisu/' + file, local))) !== expected) throw new Error('Original asset changed: ' + file);
}
manifest.originalAssets = originals;
await writeFile(new URL('original-reference.png', output), reference);
for (const file of ['review.css', 'review.js']) await copyFile(new URL('review/' + file, authoring), new URL(file, output));
const html = await readFile(new URL('review/index.html', authoring), 'utf8');
await writeFile(new URL('index.html', output), html.replace('__POSE_MANIFEST__', JSON.stringify(manifest).replaceAll('<', '\\u003c')));
await writeFile(new URL('provenance.json', output), JSON.stringify(manifest, null, 2) + '\n');
await copyFile(new URL('pose-prompts-v1.json', authoring), new URL('prompts.json', output));
console.log('Pose review: 4 candidates, original hashes verified, runtime disabled.');
console.log(decodeURIComponent(output.pathname) + 'index.html');
