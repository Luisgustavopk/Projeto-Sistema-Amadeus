import type { HealthProbe } from '../../ports/health-probe.ts';
import type { ProviderServices } from '../providers/index.ts';
import { DatabaseUnavailableError } from '../../domain/errors/database.ts';

export function createHealthService(
  database: HealthProbe,
  providers: Pick<ProviderServices, 'describe'>,
) {
  return {
    async details() {
      if (!(await database.isHealthy())) {
        throw new DatabaseUnavailableError();
      }

      return {
        api: 'ok' as const,
        database: 'ok' as const,
        providers: (await providers.describe()).map((provider) => ({
          role: provider.role,
          available: provider.available,
        })),
      };
    },
  };
}
