import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { expect, it } from 'vitest';

it.each([
  ['arquivo ausente', undefined],
  ['token ausente', 'PORT=3010\r\nSTT_SERVICE_TOKEN=test-service-secret'],
  ['token vazio', 'API_ACCESS_TOKEN=\r\nPORT=3010\r\n'],
  ['token curto', 'export API_ACCESS_TOKEN="short" # local\r\nPORT=3010\r\n'],
  ['token válido', `API_ACCESS_TOKEN="${'a'.repeat(64)}"\r\nPORT=3010\r\n`],
])('setup prepara uma credencial válida: %s', async (_label, initial) => {
  const root = await mkdtemp(join(tmpdir(), 'amadeus-setup-'));

  try {
    await mkdir(join(root, 'scripts'));
    await copyFile(
      new URL('../../scripts/setup.mjs', import.meta.url),
      join(root, 'scripts/setup.mjs'),
    );
    await writeFile(
      join(root, '.env.example'),
      'API_ACCESS_TOKEN=\nPORT=3001\n',
    );

    if (initial !== undefined) {
      await writeFile(join(root, '.env'), initial);
    }

    execFileSync(process.execPath, [join(root, 'scripts/setup.mjs')]);
    const result = await readFile(join(root, '.env'), 'utf8');
    const parsed = parseEnv(result);

    expect(parsed.API_ACCESS_TOKEN?.length ?? 0).toBeGreaterThanOrEqual(32);
    expect(parsed.PORT).toBe(initial === undefined ? '3001' : '3010');

    if (initial?.includes('STT_SERVICE_TOKEN')) {
      expect(parsed.STT_SERVICE_TOKEN).toBe('test-service-secret');
    }

    if (_label === 'token válido') {
      expect(result).toBe(initial);
    }

    execFileSync(process.execPath, [join(root, 'scripts/setup.mjs')]);
    expect(await readFile(join(root, '.env'), 'utf8')).toBe(result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
