import { readFile, writeFile } from 'node:fs/promises';
import { digest } from './lib/acting-jev.mjs';
import { summarizeJevV8 } from './lib/jev-v8-summary.mjs';

const directory = new URL(
  '../data/refinement/latency-v8-remainder/',
  import.meta.url,
);
const path = new URL('jev.json', directory);
const report = JSON.parse(await readFile(path, 'utf8'));
const manifest = JSON.parse(
  await readFile(new URL('judge-manifest.json', directory), 'utf8'),
);
const reference = JSON.parse(
  await readFile(
    new URL(
      '../data/refinement/jev-calibration-owner-2026-10-08/calibration-reference.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
if (digest(reference) !== manifest.frozen.referenceHash)
  throw new Error('REFERENCE_CHANGED');
report.summary = summarizeJevV8(reference, manifest.frozen.controls, report);
report.summary.unlabelledExtraIds = reference.synthetic
  .filter((item) => !item.review)
  .map((item) => item.id);
report.postprocessing = {
  remoteCalls: 0,
  reason: 'Exclude unlabelled extra sheets; do not manufacture human labels.',
  helperHash: digest(
    await readFile(
      new URL('./lib/jev-v8-summary.mjs', import.meta.url),
      'utf8',
    ),
  ),
};
await writeFile(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
