import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

export async function openDatabase(url: string) {
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../drizzle/', import.meta.url),
      ),
    });
    return { client, db };
  } catch (error) {
    client.close();
    throw error;
  }
}
