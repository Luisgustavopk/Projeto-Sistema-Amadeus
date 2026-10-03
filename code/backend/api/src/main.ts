import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './adapters/database/index.ts';

const config = loadConfig();
const database = await openDatabase(config.DATABASE_URL);
const app = await buildApp({
  token: config.API_ACCESS_TOKEN,
  logLevel: config.LOG_LEVEL,
});
app.addHook('onClose', async () => database.client.close());
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
