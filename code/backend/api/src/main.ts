import { buildApp } from './app.ts';
import { loadConfig } from './config/index.ts';
import { openDatabase } from './adapters/database/index.ts';
import { readFile } from 'node:fs/promises';

const config = loadConfig();
const tls =
  config.TLS_CERT_FILE && config.TLS_KEY_FILE
    ? {
        cert: await readFile(config.TLS_CERT_FILE),
        key: await readFile(config.TLS_KEY_FILE),
        minVersion: 'TLSv1.2' as const,
      }
    : undefined;
const database = await openDatabase(config.DATABASE_URL);
const app = await buildApp({
  token: config.API_ACCESS_TOKEN,
  logLevel: config.LOG_LEVEL,
  config,
  database,
  ...(tls ? { tls } : {}),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(
    {
      code:
        error instanceof Error && 'code' in error
          ? error.code
          : 'STARTUP_FAILED',
    },
    'Não foi possível iniciar a API.',
  );
  await app.close();
  process.exitCode = 1;
}
