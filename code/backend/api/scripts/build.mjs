import { rm } from 'node:fs/promises';
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
