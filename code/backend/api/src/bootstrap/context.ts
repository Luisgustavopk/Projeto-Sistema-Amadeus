import type { NotifyProviderFallback } from '../application/providers/fallback.ts';
import type { Config } from '../config/index.ts';
import type { AppOptions } from './options.ts';
import { recoverInterruptedCalls } from '../adapters/database/recover-calls.ts';
import { openDatabase } from '../adapters/database/index.ts';
import { SqliteConversationRepository } from '../adapters/database/conversation-repository.ts';
import { SqliteCallTicketRepository } from '../adapters/database/call-ticket-repository.ts';
import { SqliteProviderConfigurationRepository } from '../adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../adapters/database/provider-usage-repository.ts';
import { createSqliteHealthProbe } from '../adapters/database/health-probe.ts';
import { createProviderFactory } from '../adapters/providers/factory.ts';
import { SqliteVoiceProfileRepository } from '../adapters/database/voice-profile-repository.ts';
import { createSqliteCallHistory } from '../adapters/database/call-history-repository.ts';
import { createVoiceReferenceInspector } from '../adapters/files/voice-reference-inspector.ts';
import { createVoiceProfiles } from '../application/voice/profiles.ts';
import { createVoiceMetrics } from '../application/voice/metrics.ts';
import { createVoiceCapabilities } from '../application/voice/capabilities.ts';
import { createVoiceSessions } from '../application/voice/sessions.ts';
import { createProviderServices } from '../application/providers/index.ts';
import { createConversationService } from '../application/conversations/create.ts';
import { createTicketService } from '../application/calls/tickets.ts';
import { createCallAuthorization } from '../application/calls/authorization.ts';
import { ActivityGate } from '../application/runtime/activity-gate.ts';
import { createHealthService } from '../application/diagnostics/health.ts';
import { createRevisionRepository } from '../adapters/database/revision-repository.ts';
import { createPersonaConfiguration } from '../application/persona/configuration.ts';
import { createVoiceVersions } from '../application/voice/versions.ts';

export async function createContext(
  options: AppOptions,
  config: Config,
  onFallback?: NotifyProviderFallback,
) {
  const database = options.database ?? (await openDatabase('file::memory:'));
  await recoverInterruptedCalls(database.client);
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
    factory: createProviderFactory(secrets),
    ...(onFallback ? { onFallback } : {}),
    gate: {
      beginConfiguration: () => activity.beginProviderConfiguration(),
      beginExecution: () => activity.beginExecution(),
    },
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

  const voiceProfiles = createVoiceProfiles(
    new SqliteVoiceProfileRepository(database.client),
    createVoiceReferenceInspector(config.VOICE_REFERENCE_DIRECTORY),
    activity,
    config.OWNER_ID,
  );
  const voiceMetrics = createVoiceMetrics();
  const revisions = createRevisionRepository(database.client);
  const persona = createPersonaConfiguration(revisions, config.OWNER_ID);
  const voiceVersions = createVoiceVersions(
    revisions,
    config.OWNER_ID,
    providers,
    voiceProfiles,
    { beginConfiguration: () => activity.beginProviderConfiguration() },
  );
  const voiceCapabilities = createVoiceCapabilities(providers, voiceProfiles);
  const voiceSessions = createVoiceSessions({
    providers,
    profiles: voiceProfiles,
    history: createSqliteCallHistory(database.client),
    gate: activity,
    metrics: voiceMetrics,
    ownerId: config.OWNER_ID,
    persona,
  });

  return {
    database,
    context: {
      providers,
      voiceProfiles,
      persona,
      voiceVersions,
      voiceMetrics,
      voiceCapabilities,
      voiceSessions,
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
