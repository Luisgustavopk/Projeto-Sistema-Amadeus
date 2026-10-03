import type { Client } from '@libsql/client';
import type { HealthProbe } from '../../ports/health-probe.ts';

export function createSqliteHealthProbe(client: Client): HealthProbe {
  return {
    async isHealthy() {
      try {
        await client.execute('SELECT 1');

        return true;
      } catch {
        return false;
      }
    },
  };
}
