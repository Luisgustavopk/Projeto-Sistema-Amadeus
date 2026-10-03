import type { Config } from '../config/index.ts';
import type { AppOptions } from './options.ts';
import { openDatabase } from '../adapters/database/index.ts';
import { SqliteConversationRepository } from '../adapters/database/conversation-repository.ts';
import { SqliteCallTicketRepository } from '../adapters/database/call-ticket-repository.ts';
import { SqliteProviderConfigurationRepository } from '../adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../adapters/database/provider-usage-repository.ts';
import { createSqliteHealthProbe } from '../adapters/database/health-probe.ts';
import { createProvider } from '../adapters/providers/http-json.ts';
import { createProviderServices } from '../application/providers/index.ts';
import { createConversationService } from '../application/conversations/create.ts';
import { createTicketService } from '../application/calls/tickets.ts';
import { createCallAuthorization } from '../application/calls/authorization.ts';
import { ActivityGate } from '../application/runtime/activity-gate.ts';
import { createHealthService } from '../application/diagnostics/health.ts';

export async function createContext(options: AppOptions, config: Config) {
  const database = options.database ?? (await openDatabase('file::memory:'));
  const conversationRepository = new SqliteConversationRepository(
    database.client,
  );
  const ticketRepository = new SqliteCallTicketRepository(database.client);
  const configuration = new SqliteProviderConfigurationRepository(
    database.client,
  );
  const usage = new SqliteProviderUsageRepository(database.client);
  const activity = new ActivityGate(config.MAX_CONNECTIONS);
  const metrics = { requests: 0, errors: 0, totalDurationMs: 0 };
  const secrets = options.secrets ?? process.env;

  const providers = createProviderServices({
    configuration,
    usage,
    ownerId: config.OWNER_ID,
    factory: (role, providerConfig) =>
      createProvider(role, providerConfig, secrets),
    gate: activity,
  });
  const conversations = createConversationService(
    conversationRepository,
    config.OWNER_ID,
  );
  const tickets = createTicketService(
    conversationRepository,
    ticketRepository,
    {
      ownerId: config.OWNER_ID,
      credential: config.API_ACCESS_TOKEN,
      allowedOrigins: config.ALLOWED_ORIGINS,
      ttlSeconds: config.CALL_TICKET_TTL_SECONDS,
    },
  );
  const calls = createCallAuthorization(
    tickets,
    activity,
    config.ALLOWED_ORIGINS,
  );
  const health = createHealthService(
    createSqliteHealthProbe(database.client),
    providers,
  );

  return {
    database,
    context: {
      providers,
      conversations,
      tickets,
      calls,
      health,
      metrics,
      activity,
      ticketTtlSeconds: config.CALL_TICKET_TTL_SECONDS,
    },
  };
}
