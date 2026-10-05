import type { Client } from '@libsql/client';
import type { RevisionRepository } from '../../ports/revision-repository.ts';

export function createRevisionRepository(client: Client): RevisionRepository {
  return {
    async read(key) {
      const result = await client.execute({
        sql: 'SELECT value FROM settings WHERE key = ?',
        args: [key],
      });

      return result.rows[0] ? String(result.rows[0].value) : null;
    },
    async compareAndSave(key, previous, value) {
      const result =
        previous === null
          ? await client.execute({
              sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
              args: [key, value],
            })
          : await client.execute({
              sql: 'UPDATE settings SET value = ? WHERE key = ? AND value = ?',
              args: [value, key, previous],
            });

      return result.rowsAffected === 1;
    },
  };
}
