import { copyFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(apiRoot, 'dist');

if (dirname(output) !== resolve(apiRoot)) {
  throw new Error('Diretório de compilação fora da API.');
}

await rm(output, { recursive: true, force: true });

const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'],
  { cwd: apiRoot, stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;

if (process.exitCode === 0) {
  await copyFile(
    new URL(
      '../src/application/voice/provider-wait-presets.json',
      import.meta.url,
    ),
    resolve(output, 'application/voice/provider-wait-presets.json'),
  );
  await copyFile(
    new URL(
      '../src/application/memory/memory-extraction-v1.md',
      import.meta.url,
    ),
    resolve(output, 'application/memory/memory-extraction-v1.md'),
  );
  for (const file of [
    'conversation-directions-v1.md',
    'reaction-catalog-v0.2.md',
    'reaction-repertoire-v0.2.md',
  ]) {
    await copyFile(
      new URL('../../assets/persona/' + file, import.meta.url),
      resolve(output, 'application/persona', file),
    );
  }
  await copyFile(
    new URL('../../assets/persona/source-v0.4.md', import.meta.url),
    resolve(output, 'application/persona/source-v0.4.md'),
  );
  await copyFile(
    new URL(
      '../src/application/persona/skill-amadeus-kurisu.md',
      import.meta.url,
    ),
    resolve(output, 'application/persona/skill-amadeus-kurisu.md'),
  );
}
