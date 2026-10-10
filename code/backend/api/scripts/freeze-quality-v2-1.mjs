import { readFile, writeFile } from 'node:fs/promises';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';
const root = new URL('../../evals/persona/quality-v2.1/', import.meta.url);
const names = [
  'core-card.md',
  'turn-direction.md',
  'rubric.md',
  'pairwise-rubric.md',
  'shots.json',
  'curation-audit.json',
  'corpus-reference-profile.json',
  'patch-candidates.json',
  '../../../api/scripts/calibrate-persona-v2-1.mjs',
  '../../../api/scripts/eval-conversation-quality.mjs',
  '../../../api/scripts/judge-pairwise.mjs',
  '../../../api/scripts/prepare-persona-v2-1.mjs',
  '../../../api/scripts/profile-persona-corpus.mjs',
  '../../../api/scripts/lib/conversation-quality-report.mjs',
  '../../../api/src/evaluation/persona/experimental-suite.ts',
  '../../../api/src/evaluation/persona/pairwise.ts',
  '../../../api/src/evaluation/persona/shared-round.ts',
  '../../../api/src/evaluation/persona/judge.ts',
  '../../../api/src/evaluation/persona/router.ts',
  '../../../api/src/evaluation/persona/corpus-profile.ts',
];
const files = {};
for (const name of names)
  files[name] = fingerprint(await readFile(new URL(name, root), 'utf8'));
await writeFile(
  new URL('manifest.json', root),
  JSON.stringify(
    {
      version: 'quality-v2.1',
      files,
      datasetManifest: '../quality-v2/manifest.json',
      diagnosticsManifest: '../quality-v2/diagnostics-manifest.json',
      humanAccepted: false,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ frozen: names.length, paidCalls: 0 }));
