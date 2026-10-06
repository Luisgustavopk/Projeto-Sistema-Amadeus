import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';
import { backfillMemorySearch } from './memory-search-backfill.ts';
import { backfillMemoryEquivalence } from './memory-equivalence-backfill.ts';

export async function openDatabase(url: string) {
  const client = createClient({ url });
  const db = drizzle(client, { schema });

  try {
    // API and memory CLI use the same local file. Short writes should wait
    // briefly rather than fail immediately when another process commits.
    await client.execute('PRAGMA busy_timeout = 3000');
    await client.execute('PRAGMA foreign_keys = ON');
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../drizzle/', import.meta.url),
      ),
    });
    await backfillMemorySearch(client);
    await backfillMemoryEquivalence(client);

    return { client, db };
  } catch (error) {
    client.close();

    throw error;
  }
}
