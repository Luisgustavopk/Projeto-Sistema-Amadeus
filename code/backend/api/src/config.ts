import { z } from 'zod';

const ConfigSchema = z.object({
  API_ACCESS_TOKEN: z
    .string()
    .min(32, 'Execute npm run setup para criar uma credencial local.'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .startsWith('file:')
    .default('file:./data/amadeus.db'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = ConfigSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Configuração inválida: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return result.data;
}
