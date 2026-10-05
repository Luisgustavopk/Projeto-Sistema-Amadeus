import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/adapters/database/index.ts';
import { loadConfig } from '../src/config/index.ts';

const config = loadConfig();
const directory = fileURLToPath(new URL('../data/backups/', import.meta.url));
const filename =
  'amadeus-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db';
const target = resolve(directory, filename);

if (dirname(target) !== resolve(directory)) {
  throw new Error('Destino de backup inválido.');
}

await mkdir(directory, { recursive: true });
const database = await openDatabase(config.DATABASE_URL);

try {
  // SQLite creates a consistent independent snapshot, including WAL contents.
  await database.client.execute({ sql: 'VACUUM INTO ?', args: [target] });
  console.log('Backup SQLite consistente salvo em ' + target);
} finally {
  database.client.close();
}
