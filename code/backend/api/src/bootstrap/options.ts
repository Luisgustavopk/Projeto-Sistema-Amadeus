import type { ServerOptions } from 'node:https';
import type { Config } from '../config/index.ts';
import type { openDatabase } from '../adapters/database/index.ts';

export type AppOptions = {
  token: string;
  logLevel?: string;
  config?: Config;
  database?: Awaited<ReturnType<typeof openDatabase>>;
  tls?: ServerOptions;
  secrets?: NodeJS.ProcessEnv;
  logStream?: { write: (message: string) => void };
};
