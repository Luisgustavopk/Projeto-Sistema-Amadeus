import { loadConfig } from './config/index.ts';
import type { AppOptions } from './bootstrap/options.ts';
import { createServer } from './bootstrap/server.ts';
import { createContext } from './bootstrap/context.ts';
import { registerErrorHandlers } from './http/errors/index.ts';
import { registerObservability } from './http/observability/index.ts';
import { registerOpenApi } from './http/openapi.ts';
import { protect } from './http/security/index.ts';
import { registerHttpRoutes } from './http/routes/index.ts';
import { registerWebSocket } from './realtime/plugin.ts';
import { registerRealtimeRoutes } from './realtime/routes/index.ts';

export async function buildApp(options: AppOptions) {
  if (options.token.length < 32) {
    throw new Error('Credencial de acesso inválida.');
  }

  const config =
    options.config ?? loadConfig({ API_ACCESS_TOKEN: options.token });

  if (config.API_ACCESS_TOKEN !== options.token) {
    throw new Error('A credencial de inicialização difere da configuração.');
  }

  const app = createServer(options);
  const { database, context } = await createContext(
    options,
    config,
    (notice) => {
      app.log.warn(
        { event: 'provider.fallback', ...notice },
        notice.reason === 'DATA_POLICY_BLOCKED'
          ? 'Provedor não aprovado para a classificação dos dados; usando próxima reserva permitida.'
          : 'Modelo principal indisponível; usando modelo reserva.',
      );
    },
  );

  app.addHook('onClose', async () => {
    await context.voiceSessions.shutdown();
    await context.memory.stop();
    database.client.close();
  });
  registerErrorHandlers(app);
  registerObservability(app, context.metrics);

  try {
    // Register before security hooks so rejected upgrades close their raw socket.
    await registerWebSocket(app);
    protect(app, config);
    await registerOpenApi(app);

    registerHttpRoutes(app, context);
    registerRealtimeRoutes(app, context.calls, context.voiceSessions);

    return app;
  } catch (error) {
    await app.close();

    throw error;
  }
}
