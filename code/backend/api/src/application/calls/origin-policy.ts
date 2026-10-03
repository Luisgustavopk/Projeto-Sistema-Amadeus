import { OriginDeniedError } from '../../domain/errors/access.ts';

export function assertCallOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): asserts origin is string {
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new OriginDeniedError();
  }
}
