import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/index.ts';
import { registerSecurityHeaders } from './headers.ts';
import { registerRateLimit } from './rate-limit.ts';
import { registerOriginChecks, registerPreflight } from './cors.ts';
import { registerWebSocketUpgradeGuard } from './websocket.ts';
import { registerAuthentication } from './authentication.ts';

export function protect(app: FastifyInstance, config: Config) {
  registerSecurityHeaders(app, config);
  registerRateLimit(app, config);
  registerOriginChecks(app, config);
  // Validate upgrades before preflight can end the request.
  registerWebSocketUpgradeGuard(app);
  registerPreflight(app);
  registerAuthentication(app, config);
}
