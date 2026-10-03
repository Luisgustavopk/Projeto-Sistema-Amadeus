import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

it('atualiza um banco da fase 0 e preserva as conversas existentes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amadeus-upgrade-'));
  const legacy = createClient({ url: 'file::memory:' });
  const db = drizzle(legacy);
  const currentMigrations = fileURLToPath(
    new URL('../../drizzle/', import.meta.url),
  );

  try {
    const migrations = join(root, 'drizzle');
    await mkdir(join(migrations, 'meta'), { recursive: true });
    const journal = JSON.parse(
      await readFile(
        new URL('../../drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 2);
    await writeFile(
      join(migrations, 'meta/_journal.json'),
      JSON.stringify(journal),
    );

    for (const entry of journal.entries) {
      await copyFile(
        new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        join(migrations, `${entry.tag}.sql`),
      );
    }

    await migrate(drizzle(legacy), { migrationsFolder: migrations });
    await legacy.execute({
      sql: 'INSERT INTO foundation_conversations (id, owner_id, created_at) VALUES (?, ?, ?)',
      args: ['existing-conversation', 'primary', 1],
    });
    await migrate(db, { migrationsFolder: currentMigrations });
    expect((await legacy.execute('SELECT * FROM call_sessions')).rows).toEqual(
      [],
    );
    expect(
      (await legacy.execute('SELECT id FROM foundation_conversations')).rows[0]
        ?.id,
    ).toBe('existing-conversation');
    await migrate(db, { migrationsFolder: currentMigrations });
    expect((await legacy.execute('SELECT * FROM voice_profiles')).rows).toEqual(
      [],
    );
  } finally {
    legacy.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
