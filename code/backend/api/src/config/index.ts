import { ServerConfigSchema } from './server.ts';
import { DatabaseConfigSchema } from './database.ts';
import { SecurityConfigSchema, validateTransport } from './security/index.ts';
import { VoiceConfigSchema } from './voice.ts';

const ConfigSchema = ServerConfigSchema.extend({
  ...DatabaseConfigSchema.shape,
  ...SecurityConfigSchema.shape,
  ...VoiceConfigSchema.shape,
}).superRefine(validateTransport);

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = ConfigSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );

    throw new Error(`Configuração inválida: ${issues.join('; ')}`);
  }

  return result.data;
}

export type Config = ReturnType<typeof loadConfig>;
