import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);

it('preserva dados e reaplica migrações após reiniciar o processo', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'amadeus-test-'));
  const url = pathToFileURL(join(folder, 'test.db')).href;
  const prefix = `
    import { openDatabase } from './src/adapters/database/index.ts';
    import { settings } from './src/adapters/database/schema.ts';
    const { db, client } = await openDatabase(process.env.TEST_DATABASE_URL);
  `;
  async function run(operation: string) {
    return exec(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `${prefix}\ntry { ${operation} } finally { client.close(); }`,
      ],
      {
        env: { ...process.env, TEST_DATABASE_URL: url },
        windowsHide: true,
      },
    );
  }
  try {
    await run(
      "await db.insert(settings).values({ key: 'test', value: 'preserved' });",
    );
    const result = await run(
      'console.log(JSON.stringify(await db.select().from(settings)));',
    );
    expect(JSON.parse(result.stdout)).toEqual([
      { key: 'test', value: 'preserved' },
    ]);
  } finally {
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}, 15000);
