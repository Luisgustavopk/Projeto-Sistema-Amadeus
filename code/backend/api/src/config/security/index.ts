import { AuthenticationConfigSchema } from './authentication.ts';
import { CorsConfigSchema } from './cors.ts';
import { RateLimitConfigSchema } from './rate-limit.ts';
import { TransportConfigSchema } from './transport.ts';

export const SecurityConfigSchema = AuthenticationConfigSchema.extend({
  ...CorsConfigSchema.shape,
  ...RateLimitConfigSchema.shape,
  ...TransportConfigSchema.shape,
});

export { validateTransport } from './transport.ts';
