import { loadConfig } from './config.ts';
import { openDatabase } from './adapters/database/index.ts';
const { client } = await openDatabase(loadConfig().DATABASE_URL);
client.close();
console.log('Migrações aplicadas.');
